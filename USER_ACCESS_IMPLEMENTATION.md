# User access system — implementation reference

This document describes **what is implemented today** in the **tgddata_C1** codebase for the upgraded user-access model (roles, project scope, vertical modules, optional hierarchy, and user-linked domain fields). It complements `[USER_ACCESS_SYSTEM_UPGRADE_PLAN.md](USER_ACCESS_SYSTEM_UPGRADE_PLAN.md)`, which remains the original design discussion.

---

## 1. Goals (recap)

- Support **multiple platform personas** beyond the original three strings (`admin`, `executive`, `manager`).
- Keep **backward compatibility** for existing databases and JWTs (legacy role values still work).
- Add **project scoping** (unchanged table) plus **module / vertical** restrictions for **operations** users.
- Add optional **organisational link** (`manager_user_id`) and optional **user FKs** on requisitions, candidates, and projects for attribution and recruiter narrowing.
- Expose enough in `**GET /auth/me`** and the **Users & access** admin UI to configure users without requiring SQL.

**Non-goals in this implementation:** server-driven persona layouts (CEO vs finance dashboards), drag-and-drop org charts, and full RBAC on every single `main.py` route.

---

## 2. Role model

### 2.1 Canonical roles (effective identity)

After **alias resolution**, the system uses these **effective** roles internally:


| Effective role   | Typical meaning                                                                       |
| ---------------- | ------------------------------------------------------------------------------------- |
| `platform_admin` | Full platform access; admin APIs.                                                     |
| `executive`      | Org-wide **unless** given project assignments (then scoped like a head).              |
| `operations`     | **Project-scoped**; **vertical allow-list** enforced on gated routers.                |
| `project_head`   | **Project-scoped**; same broad data access as legacy “manager” within those projects. |
| `recruiter`      | **Project-scoped**; **narrowed** requisitions/candidates + **tighter** activity log.  |


### 2.2 Legacy storage (still valid)


| Stored in DB | Maps to (effective) |
| ------------ | ------------------- |
| `admin`      | `platform_admin`    |
| `manager`    | `project_head`      |


**Implementation:** `backend/auth/profile.py` — `LEGACY_ROLE_ALIASES`, `effective_role()`.

**Admin API normalisation:** Creating or patching a user with role `admin` / `manager` **persists** `platform_admin` / `project_head` (`backend/admin/routes.py` — `_normalize_role_input`). Existing rows may still show `admin` until edited.

### 2.3 Unknown role strings

If `users.role` is not a known canonical or legacy value, `**allowed_project_ids()`** does **not** raise HTTP 403. The profile resolver treats the user as **project-scoped** with `**project_ids` = assigned projects only** (possibly **empty**). This avoids breaking logins while surfacing a misconfiguration.

---

## 3. Project scope

**Source of truth:** `user_project_assignments` (`user_id`, `project_id`).

**Resolution:** `resolve_user_profile()` → `project_ids: Optional[Set[int]]`


| Effective role                            | No assignments              | With assignments      |
| ----------------------------------------- | --------------------------- | --------------------- |
| `platform_admin`                          | Unrestricted (`None`)       | Unrestricted (`None`) |
| `executive`                               | Unrestricted (`None`)       | Restricted to set     |
| `project_head`, `operations`, `recruiter` | Empty set (no project data) | Restricted to set     |


**Consumers:** `backend/auth/deps.py` — `allowed_project_ids()`; `backend/auth/scope.py` — `apply_project_scope`, `assert_project_access`, `assert_client_access`, `scoped_clause_record`, `account_accessible`.

**Unchanged pattern:** Most list/detail endpoints and routers still use `apply_project_scope` or `allowed_project_ids` as before.

---

## 4. Vertical (module) access — **operations** only

### 4.1 Storage

- Column: `**users.vertical_access_json`** (JSON array of strings), migrated on SQLite via `database.py` — `_ensure_user_rbac_and_attribution_columns()`.

### 4.2 Allowed keys

Defined in `**backend/auth/profile.py`** as `VERTICAL_KEYS`, e.g.:

`finance`, `sla`, `wfm`, `requisitions`, `candidates`, `contracts`, `meetings`, `ingestion`, `revenue_forecast`, `revenue_billing`, `vendor_licenses`, `tasks`, `portfolio`, `clients`, `data_operations`, `admin_users`.

Admin `**PATCH /admin/users/{id}**` rejects unknown keys.

### 4.3 Enforcement logic

- `**operations_may_access_vertical(profile, key)**` (`profile.py`):
  - Not `operations` → **allow**.
  - `operations` + `vertical_access_json` **missing / null** → **allow all** (transition-friendly).
  - `operations` + **empty** list → **deny** all gated vertical checks.
  - `operations` + non-empty list → allow only if `key` is in the set.
- **Router-level dependency:** `backend/auth/verticals.py` — `require_vertical("…")`.

### 4.4 Where vertical gating is **implemented**


| Router / prefix | Vertical key |
| --------------- | ------------ |
| `/finance/*`    | `finance`    |
| `/sla/*`        | `sla`        |


**Not gated** (examples): WFM router, candidates, meetings, most of `main.py` (portfolio, clients, records list, budget endpoints, etc.) — **operations** users can still hit those if project scope allows.

---

## 5. Hierarchy (`manager_user_id`)

### 5.1 Implemented

- Column `**users.manager_user_id`** (nullable FK → `users.id`).
- `**GET /auth/me`** returns `manager_user_id`.
- **Admin** `PATCH` can set/clear it (with validation: not self, target user must exist).
- `**descendant_user_ids()`** in `profile.py` — **BFS over `manager_user_id`**, cycle-safe — **available for future use**.

### 5.2 Not implemented (yet)

- **Activity log** does **not** use the report chain to show “my team’s” events for project heads.  
Current rules: **platform admin / legacy admin** → all; **recruiter** → own user id only; **everyone else** → same as before (own rows **or** rows with `project_id` in assigned projects).

---

## 6. Recruiter narrowing

### 6.1 Requisitions (`records`)

After normal `**project_id` scoping**, `**GET /records/all`** applies `**apply_recruiter_record_scope`** (`backend/auth/scope.py`) when **effective role is `recruiter`**:

- Rows where `**assigned_recruiter_user_id**` or `**hiring_manager_user_id**` = current user, **or**
- Legacy fallback: `**assigned_recruiter_user_id` is null** and **text** fields `**assigned_recruiter_rpo`** / `**hiring_manager`** ILIKE the user’s **email** or **local-part**.

### 6.2 Candidates

List endpoint applies `**apply_recruiter_candidate_scope`** (same idea on `candidates` table fields).

### 6.3 Tasks

No separate recruiter-specific filter: recruiters see tasks under the **existing** task scope rules (creator, assignee, or task `project_id` in allowed projects).

### 6.4 Activity log

**Recruiters** only see `**ActivityLog.user_id == self`** (stricter than other scoped roles).

---

## 7. User-linked domain fields (optional FKs)

### 7.1 Implemented columns (SQLite-migrated)


| Table        | New columns                                            |
| ------------ | ------------------------------------------------------ |
| `users`      | `manager_user_id`, `vertical_access_json`              |
| `projects`   | `project_head_user_id`                                 |
| `records`    | `hiring_manager_user_id`, `assigned_recruiter_user_id` |
| `candidates` | `hiring_manager_user_id`, `assigned_recruiter_user_id` |


Legacy **string** columns (e.g. `hiring_manager`, `assigned_recruiter`) remain for ingest and display.

### 7.2 API support

- `**PATCH /records/{id}`** — optional `hiring_manager_user_id`, `assigned_recruiter_user_id` (validates active user).
- `**PATCH /projects/{id}`** metadata — optional `project_head_user_id`.
- **Candidates router** — create/patch supports the two FKs; **PATCH** validates user ids.

### 7.3 Not implemented

- Automatic **backfill** from string names → user ids on ingest.
- `**taggd_pm_user_id`** and similar on candidates.
- **Meeting** `chair_user_id` / structured attendee user ids (only existing `organizer_user_id` / `created_by_user_id`).

---

## 8. Tasks and platform admin checks

- `**backend/routers/tasks.py`** uses `**is_platform_admin()`** and `**effective_role()**` instead of comparing raw `"admin"` / `"manager"` strings.
- **Assignee validation** for “shared project” applies to **effective `project_head`** (includes legacy `manager`).
- **Delete task:** allowed for **platform admin**, **executive**, or **creator** (same intent as before, with alias-aware admin).

---

## 9. Authentication API

### 9.1 `GET /auth/me` (additive)

Returns:

- Existing: `id`, `email`, `role`, `project_ids`
- Added: `**effective_role`**, `**vertical_access`** (sorted list or `null`), `**manager_user_id**`

### 9.2 `POST /auth/login`

Unchanged shape; `user.role` reflects **stored** DB value.

---

## 10. Admin API (`/admin/users`)

- **Roles accepted:** `admin`, `platform_admin`, `executive`, `manager`, `project_head`, `operations`, `recruiter`.
- **List users** includes `**manager_user_id`**, `**vertical_access`**.
- **Patch user** supports `**manager_user_id`**, `**vertical_access`** (validated keys).
- **Create user** normalises `admin` → `platform_admin`, `manager` → `project_head` on write.

---

## 11. Frontend

### 11.1 Implemented

- `**frontend/src/lib/auth.tsx`** — Wider role typing; stores `**effectiveRole`**, `**verticalAccess**`, `**managerUserId**` from `/auth/me`; `**isPlatformAdminRole()**` for `admin` + `platform_admin`; nav maps for new roles (including narrower **recruiter** paths).
- `**frontend/src/pages/AdminUsers.tsx`** (**Users & access**) — Five create roles; table shows **stored role**, **effective label**, **reports-to**, **vertical summary**, **projects**; **Edit access** modal (role, manager dropdown, module checkboxes); **Projects** modal with updated help text.
- `**frontend/src/lib/api.ts`** — `**AdminUserRow`** and `**patchUser**` extended.
- **Tasks / Activity log / Ingestion** copy or guards use `**isPlatformAdminRole`** where relevant.

### 11.2 Not implemented

- **Nav / pages** are **not** fully hidden by `vertical_access` for non-operations users (client-side persona is still partly static).
- **Operations** users may still **see** menu entries for WFM, etc.; **server** may allow or deny per endpoint — **no global frontend vertical gate** yet.

---

## 12. Files reference (primary touchpoints)


| Area                     | Files                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Profile & verticals      | `backend/auth/profile.py`, `backend/auth/verticals.py`                                                                      |
| Scope & deps             | `backend/auth/deps.py`, `backend/auth/scope.py`                                                                             |
| Auth routes              | `backend/auth/routes.py`                                                                                                    |
| Admin                    | `backend/admin/routes.py`                                                                                                   |
| Tasks                    | `backend/routers/tasks.py`                                                                                                  |
| Finance / SLA gating     | `backend/routers/finance_ledger.py`, `backend/routers/sla_metrics.py`                                                       |
| Candidates               | `backend/routers/candidates.py`                                                                                             |
| Activity log             | `backend/core/activity_log.py`                                                                                              |
| Records / projects patch | `backend/main.py` (e.g. `RecordPatch`, `patch_record`, `ProjectMetadataPatch`, `get_all_records`)                           |
| Schema & migrations      | `backend/db/database.py` (`User`, `Project`, `Record`, `Candidate`, `_ensure_user_rbac_and_attribution_columns`, `init_db`) |
| Frontend admin & auth    | `frontend/src/pages/AdminUsers.tsx`, `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts`                                 |


---

## 13. Operational notes

1. **Bootstrap admin** may still be stored as `**admin`**; behaviour is **platform admin** via aliases.
2. **Operations** users need `**finance` / `sla`** in `**vertical_access_json`** to use `**/finance**` and `**/sla**` APIs; **null** JSON means **no vertical restriction** for operations.
3. **Saving “all modules”** from the admin UI typically persists the **full** key list (equivalent to unrestricted for gating).
4. **Clearing `vertical_access` back to SQL `NULL`** via API is **not** exposed (patch only updates when `vertical_access` is sent); workarounds: direct DB or future API flag.

---

## 14. Summary table — implemented vs not


| Feature                                           | Status                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| Canonical + legacy roles                          | **Implemented**                                    |
| `resolve_user_profile` / `effective_role`         | **Implemented**                                    |
| Project scope via assignments                     | **Implemented** (unchanged mechanism)              |
| Executive: no assignments = org-wide              | **Implemented**                                    |
| Executive: with assignments = scoped              | **Implemented**                                    |
| Operations vertical JSON + validation             | **Implemented**                                    |
| Vertical enforcement on routers                   | **Partial** — `/finance`, `/sla` only              |
| `manager_user_id` on users                        | **Implemented**                                    |
| Activity log filtered by report tree              | **Not implemented** (`descendant_user_ids` unused) |
| Recruiter record/candidate narrowing              | **Implemented**                                    |
| Recruiter task-specific filter                    | **Not implemented** (uses general task scope)      |
| Optional FKs on records/candidates/projects       | **Implemented** + PATCH                            |
| Ingest auto-link strings → user ids               | **Not implemented**                                |
| `GET /auth/me` profile fields                     | **Implemented**                                    |
| Users & access UI (roles, manager, verticals)     | **Implemented**                                    |
| Frontend nav driven only by `vertical_access`     | **Not implemented**                                |
| Per-project role (“finance on A, recruiter on B”) | **Not implemented**                                |
| CEO-dedicated UI / persona from server            | **Not implemented**                                |


---

*Last updated to match the repository implementation. For migration steps and phased checklist, see `[USER_ACCESS_SYSTEM_UPGRADE_PLAN.md](USER_ACCESS_SYSTEM_UPGRADE_PLAN.md)` §12 and the “Implementation log” there.*