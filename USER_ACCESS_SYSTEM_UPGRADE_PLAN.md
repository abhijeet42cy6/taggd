# User access system upgrade — architecture & implementation plan

This document analyses the current **tgddata_C1** codebase and proposes how to evolve authentication, authorisation, and user-linked domain data to support **platform admin**, **CEO/Executive**, **Operations** (vertical-scoped), **Project heads**, and **Recruiters**, including **project scope**, **vertical (tab) scope**, and optional **organisational hierarchy** — **without breaking existing behaviour** during migration.

**Scope of this phase:** data model, backend enforcement strategy, and API/profile shape. **Explicitly out of scope for now:** persona-specific UI layouts (the existing frontend `persona.tsx` mock remains separate until you wire it to server-driven profile).

---

## 1. Current state (as implemented today)

### 1.1 User model and roles

- **Table:** `users` (`backend/db/database.py`)
  - `email`, `password_hash`, `role` (`String(32)`), `is_active`, timestamps.
  - Docstring states: *platform login: admin | executive | manager*.
- **Admin API** (`backend/admin/routes.py`)
  - `VALID_ROLES = {"admin", "executive", "manager"}`.
  - CRUD for users; `PUT /admin/users/{id}/projects` replaces `user_project_assignments`.

### 1.2 Project assignment

- **Table:** `user_project_assignments` — `(user_id, project_id)` unique.
- **Used everywhere** project scoping is applied.

### 1.3 Central authorisation primitives


| Location                     | Responsibility                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `backend/auth/deps.py`       | `normalized_role()`, `get_current_user`, `require_roles()`, `**allowed_project_ids()`**, `can_create_unmatched_project()`      |
| `backend/auth/scope.py`      | `apply_project_scope()`, `assert_project_access()`, `assert_client_access()`, `account_accessible()`, `scoped_clause_record()` |
| `backend/auth/middleware.py` | JWT → `request.state.user`                                                                                                     |
| `backend/auth/routes.py`     | `POST /auth/login`, `**GET /auth/me`** returns `id`, `email`, `role`, `project_ids` (sorted list or `null`)                    |


`**allowed_project_ids()` semantics (critical):**

- `**admin`:** `None` → **no project filter** (full org).
- `**executive`:** loads assignment rows; if **empty**, treats as **unrestricted** (`None`) — same as admin for reads.
- `**manager`:** loads assignment rows; **empty set** → queries that use this often become `filter(false())` or “mine only” special cases.
- **Any other role string:** `HTTP 403` *Unknown role* at call sites that use `allowed_project_ids`.

So today the system is effectively **three tiers**: global (admin / unscoped executive), **project-scoped** (manager / scoped executive), with **executive** optionally org-wide.

### 1.4 Where project scope is applied

- `**main.py`:** Most list/detail endpoints for projects, records (requisitions), dashboards, finance, WFM, SLA-related aggregates, budget/forecast, clients hub — via `apply_project_scope` or `allowed_project_ids`.
- **Routers:** `candidates.py`, `project_contracts.py`, `revenue_billing.py`, `revenue_trackers.py`, `finance_ledger.py` (and related), `sla_metrics.py`, `wfm_benchmark.py`, `resume_supplier_licenses.py` — pattern: `apply_project_scope(q, user, db, Model)`.
- `**meetings.py`:** Custom `_apply_meeting_scope`: unrestricted; else project-linked meetings in scope OR meetings with no `project_id` created by current user.
- `**tasks.py`:** Custom `_apply_task_scope` and `_assert_task_access`: admin unrestricted; others see tasks they **created**, are **assigned to**, or tied to a **project in scope**; assignee validation for `**manager`** only restricts assignees to users who share an assigned project.

### 1.5 Activity log scoping

- `**backend/core/activity_log.py`** — `_scoped_activity_query`:
  - **admin:** all rows.
  - **Others:** if user has **no** `user_project_assignments`, only `**ActivityLog.user_id == self`**.
  - If they have assignments: **own rows OR** `(project_id IN assigned projects)`.

There is **no** notion of “see my reports’ activity” today.

### 1.6 Frontend (reference only)

- `**frontend/src/lib/auth.tsx`:** `AuthRole = "admin" | "executive" | "manager"`; `/auth/me` drives `projectIds`.
- `**frontend/src/lib/persona.tsx`:** **Client-only** nav mock (CEO, Finance, WFM, Client Manager, Ops) — **not** tied to DB role; ops bypasses `scopedNav` in code.

---

## 2. Target concepts (product requirements mapped to engineering)


| Concept             | Meaning                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform admin**  | Full platform access; user administration; bypass project/vertical limits.                                                                                                         |
| **CEO / Executive** | Same authority as today’s org-wide executive (optionally still assignable projects for reporting); **UI priority** is frontend later.                                              |
| **Operations**      | **Project-scoped** + **vertical-scoped** (e.g. finance-only on N projects — no SLA KPI routes for them unless granted).                                                            |
| **Project head**    | **Project-scoped** “owner”: all domains **for assigned projects** (revenue, SLA, WFM, finance, contracts, etc.); should see **activity** of users working under them (recruiters). |
| **Recruiter**       | Narrow scope: **requisitions** (and candidates) **for assigned projects**, ideally further filtered by **assignment to self**; **tasks** assigned by PMs + own tasks.              |


**Hierarchy (future-proof):**

- Assign **projects** to a user (existing table).
- Optionally assign **direct reports** (or infer from `reports_to_user_id`) for “people under them”.
- Optionally **per-project role** (e.g. same person is “finance ops” on project A and “recruiter” on project B) — not required day one but shapes schema choice.

---

## 3. Proposed structure: roles + dimensions

Avoid a single overloaded `role` string for everything. Recommended approach:

### 3.1 Primary role (`users.role`)

Extend allowed values (and **keep legacy aliases** in code for one migration period):


| Stored value (proposed) | Legacy alias | Default project scope                              | Default vertical scope                                    |
| ----------------------- | ------------ | -------------------------------------------------- | --------------------------------------------------------- |
| `platform_admin`        | `admin`      | Unrestricted                                       | All                                                       |
| `executive`             | `executive`  | Unrestricted if no assignments (keep current rule) | All                                                       |
| `operations`            | *(new)*      | From `user_project_assignments`                    | From `user_vertical_access`                               |
| `project_head`          | `manager`    | From assignments                                   | All **within** those projects                             |
| `recruiter`             | *(new)*      | From assignments                                   | Requisitions / candidates / tasks (enforced in resolvers) |


**Backward compatibility:** In `normalized_role()` or a new `resolve_effective_profile()`, map:

- `admin` → `platform_admin`
- `manager` → `project_head`

until DB backfill updates rows.

### 3.2 Vertical (tab / feature) access

**New:** either a JSON column on `users` or a normalised table.

- `**users.vertical_access_json`** — nullable `JSON` array of string keys, e.g.  
`["finance","revenue_forecast","contracts","meetings","ingestion","sla","wfm","requisitions","candidates","tasks","admin_users"]`
- `**null` or empty array** → interpret as **all verticals** for roles that are not `operations` (or define explicitly per role in code).

**Enforcement (backend):**

- Introduce a small registry mapping **route prefixes or tags** → **vertical key** (e.g. `/finance` → `finance`, `/sla-performance` API bundle → `sla`).
- Dependency: `require_vertical("finance")` **or** middleware that checks `request.url.path` against allowed set.
- **Default for existing users after migration:** `null` → no behaviour change.

### 3.3 Project scope

- **Keep** `user_project_assignments` as the source of truth for “which projects”.
- **Executive:** preserve current rule: **no rows = org-wide** (optional later: force explicit assignments for stricter orgs).

### 3.4 Hierarchy (reports / team)

**New (minimal):**

- `users.manager_user_id` — nullable FK → `users.id` (“reports to”).
- Optional later: `user_project_roles` `(user_id, project_id, role_on_project)` for mixed hats.

**Activity visibility for project heads:**

- Extend `_scoped_activity_query`: if effective role is `project_head`, include logs where `user_id` is **in subtree** (recursive CTE or materialised “team_ids” updated on change) **and** `project_id` is in head’s assigned projects (or null with care).

Recruiter activity: tighter — own `user_id` only unless you grant “team lead” later.

### 3.5 Requisition / candidate assignment (recruiter)

Today **strings only** on core tables:

- `records`: `hiring_manager`, `assigned_recruiter_rpo`, …
- `candidates`: `assigned_recruiter`, `hiring_manager`, `taggd_pm`, …

**Add optional FKs** (nullable, indexed):

- `records.assigned_recruiter_user_id` → `users.id`
- `records.hiring_manager_user_id` → `users.id` (optional; keep `hiring_manager` text for ingest)
- `candidates.assigned_recruiter_user_id`, `candidates.hiring_manager_user_id` (same pattern)

**Ingest:** continue filling **text** fields from Excel; optional **resolver** step (email → user id) when confident.

**Recruiter list scope:** filter `Record`/`Candidate` by `project_id IN allowed_projects` AND (`assigned_recruiter_user_id == me` OR legacy string match email — phased).

### 3.6 Project-level “head” as user

Today `projects.project_head` is **String**. Add optional:

- `projects.project_head_user_id` → `users.id`

Keep string for display/ingest snapshot. Admin UI can pick a platform user to sync FK.

---

## 4. Database inventory — where to link `users.id` (optional FKs)

Below: **already have user FK**, **string today → add optional FK**, **meeting/audit**.


| Area            | Table                      | Existing user link                               | String / gap                                              | Proposed addition                                                                    |
| --------------- | -------------------------- | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Auth            | `users`                    | PK                                               | —                                                         | `manager_user_id`, `vertical_access_json` (or side table)                            |
| Assignments     | `user_project_assignments` | `user_id`                                        | —                                                         | Optional `role_hint` enum per row (later)                                            |
| Tasks           | `platform_tasks`           | `created_by_`*, `completed_by_*`, `updated_by_*` | —                                                         | OK                                                                                   |
| Task assignees  | `task_assignees`           | `user_id`                                        | —                                                         | OK                                                                                   |
| Meetings        | `platform_meetings`        | `organizer_user_id`, `created_by_user_id`        | `organizer_name`, attendees text                          | Optional `chair_user_id`; JSON attendee list with `user_id`                          |
| Activity        | `activity_log`             | `user_id`                                        | `actor_email`                                             | OK                                                                                   |
| Ingestion audit | `ingestion_events`         | `user_id`                                        | —                                                         | OK                                                                                   |
| Requisitions    | `records`                  | —                                                | `hiring_manager`, `assigned_recruiter_rpo`, RPO text cols | `hiring_manager_user_id`, `assigned_recruiter_user_id`                               |
| Candidates      | `candidates`               | —                                                | `assigned_recruiter`, `hiring_manager`, `taggd_pm`        | `assigned_recruiter_user_id`, `hiring_manager_user_id` (optional `taggd_pm_user_id`) |
| Projects        | `projects`                 | —                                                | `project_head`, `practice_head`, `regional_head`, …       | `project_head_user_id` first; others later if needed                                 |
| Contracts       | `project_contracts`        | —                                                | `practice_head_snapshot`, signoff strings                 | Optional FKs only if product needs workflow                                          |
| Finance         | `finance_*` tables         | `entered_by_user_id` (where present)             | —                                                         | OK                                                                                   |
| SLA / WFM KPIs  | metric / KPI tables        | `metrics_last_updated_by_user_id` / similar      | —                                                         | OK                                                                                   |


**Principle:** keep **legacy string columns** for **ingest and exports**; add **nullable FKs** for **platform-native** attribution and RBAC queries.

---

## 5. Code changes by area (backend)

### 5.1 Single “effective profile” module (new)

**Add** `backend/auth/profile.py` (name illustrative) that returns a structured object:

- `effective_role` (canonical enum after alias map)
- `project_scope`: `{ mode: "unrestricted" | "restricted", ids: set[int] }`
- `vertical_keys`: `set[str] | None` (None = all)
- `is_recruiter`, `is_project_head`, flags for special task/record rules

**Refactor** `allowed_project_ids()` to call this (or implement profile first and thin-wrap `allowed_project_ids` for minimal diff).

### 5.2 `deps.py`

- Widen role handling: **never** 403 *Unknown role* for new roles; unknown → deny only where appropriate.
- `can_create_unmatched_project`: include `platform_admin`, `executive`; exclude `operations` / `recruiter` by default; **project_head** = **exclude** (same as today’s manager).

### 5.3 `scope.py`

- Largely **unchanged** if `allowed_project_ids` (or profile) still returns `None` | `set`.
- **Recruiter exception:** some endpoints may need **additional** filters (record assignee) — implement in **router** or a `apply_recruiter_record_scope(q, user, db)` helper, not necessarily inside `apply_project_scope`.

### 5.4 `tasks.py`

- Replace hard-coded `normalized_role(user) == "admin"` with `**effective_role == platform_admin`** (or capability `tasks.admin`).
- `_validate_manager_assignees`: generalise to **project_head** (and optionally **executive**): same “shared project” rule.
- `_apply_task_scope` for **recruiter**: intersect with `(created_by OR assignee OR project in scope)` — likely **same as manager** today if recruiters only get project-scoped tasks; tighten later with `task_category` or assignment rules.
- **Delete task:** today `admin`/`executive` or creator — extend to `platform_admin` alias; consider **project_head** delete on project tasks (product decision).

### 5.5 `activity_log.py`

- Branch on `effective_role`:
  - `platform_admin`: all.
  - `executive`: all (or same as admin).
  - `project_head`: own + assigned projects + **descendant users’** rows in those projects (requires `manager_user_id` graph).
  - `operations` / `recruiter`: start with **same as current non-admin** rules, then tighten recruiter to self.

### 5.6 `admin/routes.py`

- Extend `VALID_ROLES` / validation to new strings.
- **Optional:** endpoints to PATCH `vertical_access_json`, `manager_user_id` (platform_admin only).

### 5.7 `auth/routes.py` — `/auth/me`

**Extend response** (additive):

```json
{
  "id", "email", "role",
  "project_ids",
  "effective_role": "project_head",
  "vertical_access": ["finance", "contracts"] | null,
  "manager_user_id": 12 | null
}
```

Frontend can stay on old fields until updated; **no breaking change** if new keys are optional.

### 5.8 Vertical gating on routes

**Phase 1 (low risk):** central FastAPI dependency that checks path against a static map; return 403 with clear `detail`.

**Phase 2:** decorate sub-routers (`finance_ledger`, `sla_metrics`, …) with `dependencies=[Depends(require_vertical("finance"))]`.

**Important:** `main.py` is large — consider extracting route groups to routers gradually; until then, a **single middleware** or **dependency on duplicated endpoints** is acceptable.

### 5.9 Processor / ingest

- No requirement to write FKs on ingest **v1**; optional post-process: match `assigned_recruiter` string to `users.email`.

---

## 6. Frontend (later; profile-dependent)

- Extend `AuthRole` / `AuthUser` to accept new `role` strings and optional `vertical_access` from `/auth/me`.
- **Replace or gate** `persona.tsx` manual personas: either **remove ops bypass** or derive **nav** from `vertical_access` + `effective_role`.
- **Do not block** backend work; feature-flag **strict nav** when profile fields present.

---

## 7. Migration strategy (no capability loss)

1. **DB migration script** (SQLite-safe `ALTER` / batch for Postgres if you move):
  - Add nullable columns: `users.manager_user_id`, `users.vertical_access_json`, optional FK columns on `records`, `candidates`, `projects`.
2. **Data migration:**
  - `UPDATE users SET role = 'platform_admin' WHERE role = 'admin'` (or keep `admin` and only map in code — your choice; **code alias is mandatory** if you don’t touch DB immediately).
  - `UPDATE users SET role = 'project_head' WHERE role = 'manager'` (same note).
3. **Deploy code** that understands **both** old and new role strings.
4. **Smoke tests:** login as each legacy role; hit `/projects`, `/records`, `/tasks`, `/auth/me`, `/activity/log`.
5. **Introduce** new roles (`operations`, `recruiter`) only after step 3 is stable.

---

## 8. Phased delivery checklist


| Phase  | Deliverable                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| **P0** | `effective_role` alias map; extend `VALID_ROLES`; `/auth/me` additive fields; document vertical keys |
| **P1** | `users.vertical_access_json` + enforcement on selected high-risk routes (finance, SLA)               |
| **P1** | Optional FKs on `records`/`candidates` + API PATCH to set hiring manager / recruiter user            |
| **P2** | `users.manager_user_id` + activity log expansion for project heads                                   |
| **P2** | Recruiter-specific record/candidate query filters                                                    |
| **P3** | `user_project_roles` or per-project hats if real org needs it                                        |
| **P3** | UI driven by profile                                                                                 |


---

## 9. Risks and mitigations


| Risk                                                   | Mitigation                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `allowed_project_ids` raises 403 for new role          | Central profile resolver; exhaustive role map                   |
| Executive “empty assignments = full org” surprises ops | Document; optional env `EXECUTIVE_REQUIRES_ASSIGNMENTS=1` later |
| Vertical map drifts from `main.py` reality             | Single `VERTICAL_ROUTE_MAP` constant + integration test         |
| Recruiter too restricted (legacy string assignees)     | Phase: OR filter on string email match for transition           |
| SQLite ALTER limitations                               | Use existing patterns in `database.py` init/migrate section     |


---

## 10. Files expected to change (summary)


| File / area                    | Change type                                            |
| ------------------------------ | ------------------------------------------------------ |
| `backend/db/database.py`       | New columns (+ migrate helpers)                        |
| `backend/auth/deps.py`         | Role + scope resolution                                |
| `backend/auth/profile.py`      | **New** — effective profile                            |
| `backend/auth/routes.py`       | Richer `/auth/me`                                      |
| `backend/admin/routes.py`      | New roles; optional PATCH fields                       |
| `backend/core/activity_log.py` | Scoped query by role + hierarchy                       |
| `backend/routers/tasks.py`     | Role checks → effective role / capabilities            |
| `backend/main.py`              | Vertical checks on major sections (or extract routers) |
| `backend/routers/*.py`         | Optional `require_vertical`                            |
| `frontend/src/lib/auth.tsx`    | Types + consume new `/auth/me` fields (later)          |


---

## 11. Conclusion

The current system is **sound for project-level RBAC** (`user_project_assignments` + `apply_project_scope`) but **collapses many personas into three role strings** and has **no vertical dimension**. The upgrade path is:

1. **Canonical roles** with **legacy aliases** for `admin` / `manager`.
2. **Optional `vertical_access_json`** for operations-style users.
3. **Optional FKs** on requisitions/candidates/projects for **attribution and recruiter scoping**, keeping **string columns** for ingest.
4. **Optional `manager_user_id`** for **team-scoped activity** for project heads.
5. **Profile-first `/auth/me`** so the **same backend** can drive UI later without another redesign.

This preserves **executive unscoped behaviour**, **manager project scoping**, and **task/meeting/activity** semantics while adding the hooks your org model needs.

---

*Document generated from repository analysis (FastAPI backend + React frontend). Update this plan as implementation decisions are locked (e.g. exact vertical key vocabulary, recruiter filter rules).*

---

## 12. Implementation log (executed)


| Phase  | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Done    | `backend/auth/profile.py` — canonical roles, aliases, `resolve_user_profile`, `VERTICAL_KEYS`, `operations_may_access_vertical`. `deps.py` — `allowed_project_ids` via profile (no 403 unknown role; unknown → empty project set). `require_roles` accepts `admin`↔`platform_admin`. `can_create_unmatched_project` for platform_admin + executive. `/auth/me` adds `effective_role`, `vertical_access`, `manager_user_id`. |
| **P0** | Done    | `tasks.py` — `is_platform_admin`, `effective_role` for assignee rules + delete. `activity_log.py` — platform_admin + legacy admin full access; **recruiter** → own rows only.                                                                                                                                                                                                                                               |
| **P0** | Done    | `admin/routes.py` — roles + `UserPatch.manager_user_id`, `vertical_access` (validated against `VERTICAL_KEYS`). Create/patch normalize `admin`→`platform_admin`, `manager`→`project_head`.                                                                                                                                                                                                                                  |
| **P1** | Done    | DB: `users.manager_user_id`, `users.vertical_access_json`; `projects.project_head_user_id`; `records`/`candidates` `hiring_manager_user_id`, `assigned_recruiter_user_id` + SQLite `_ensure_user_rbac_and_attribution_columns()`.                                                                                                                                                                                           |
| **P1** | Done    | `backend/auth/verticals.py` — `require_vertical(key)`. Routers `/finance`, `/sla` use it (operations-only gate).                                                                                                                                                                                                                                                                                                            |
| **P1** | Done    | `RecordPatch` + `patch_record` FK fields; `ProjectMetadataPatch.project_head_user_id`; candidates create/patch + list scope `apply_recruiter_candidate_scope`; `GET /records/all` + `apply_recruiter_record_scope`.                                                                                                                                                                                                         |
| **P2** | Partial | Recruiter requisition/candidate narrowing implemented. Activity “subtree for project heads” deferred (current non-recruiter rule unchanged: own + project-scoped rows).                                                                                                                                                                                                                                                     |
| **P3** | Done    | `frontend/src/lib/auth.tsx` — profile fields, `isPlatformAdminRole`, nav keys for `platform_admin`, `project_head`, `operations`, `recruiter`. Tasks / Activity / Ingestion hints updated.                                                                                                                                                                                                                                  |


**Follow-ups:** Extend `require_vertical` to more routers (`/wfm`, main.py finance-only sections); optional env to force executives to have assignments; backfill `users.role` to canonical strings in DB.