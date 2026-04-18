# Task system — platform tagging and “comprehensive” work tracking (analysis report)

**Update:** A first implementation pass lives in `frontend/src/lib/task-platform-links.ts` (canonical link kinds + deep links for all major routes), expanded categories and filters in `frontend/src/pages/Tasks.tsx`, and `GET /tasks?task_category=&linked_resource_type=` in `backend/routers/tasks.py`. Revenue governance and meetings honour `?submission=` / `?meeting=` for deep links from tasks.

This report analyses the **current** tasks implementation in this repo, gaps versus a **function-attached** model (e.g. revenue packs, finance validation rows), and a practical roadmap to make the system **more comprehensive** without a disruptive rewrite.

---

## 1. Current implementation (what exists today)

### 1.1 Data model (`platform_tasks`)

Defined in `backend/db/database.py` (`Task`):

| Field | Role |
|-------|------|
| `title`, `description`, `status`, `priority`, `due_at` | Core work item |
| `task_category` | Loose grouping (string) |
| `task_subtype` | Finer string tag (no enforced vocabulary in API) |
| `linked_resource_type`, `linked_resource_id` | Optional pointer to “something else” (both free-form strings today) |
| `project_id` | Account/project scope (used for RBAC with assignees / creator) |
| `meta_json` | JSON bag for extensibility (underused in UI) |

Task API: `backend/routers/tasks.py` — list filters: **`status`**, **`project_id`**, **`mine`**, **`overdue`**. There is **no** server-side filter for `task_category`, `linked_resource_type`, or subtype.

### 1.2 UI (`frontend/src/pages/Tasks.tsx`)

- **Categories** are a **fixed dropdown** (`CATEGORIES`): ingestion, requisition, client_project, contract, meeting, billing, finance, sla, wfm, vendor_license, candidate, admin, adhoc. There is **no dedicated “revenue pack / governance”** category; closest is **“Billing / revenue”** or **ad hoc**.
- **Subtype** and **linked resource type/id** are **free-text** in the create/edit dialog — powerful but error-prone and inconsistent (`requisition` vs `record`, typos, unknown IDs).
- **Board cards** show: status, **category label only** (not `task_subtype`), due date, assignees, project line, and link as a **raw** string `type:id` — **not** a clickable deep link into Revenue Governance, Finance Validation, a record, etc.
- Sample/demo tasks in code show **intended** richness (`task_subtype`, `linked_resource_type`) but live tasks often stay at “— None —” if users only fill title.

### 1.3 Gap vs your goal

| Goal | Today |
|------|--------|
| Tasks **visibly tied** to platform functions (e.g. **weekly revenue pack**) | No first-class category; link is opaque text; no navigation to `/revenue-governance` with context |
| **Consistent** tagging across modules | No shared registry; no API validation of `linked_resource_*` |
| **Filter / report** by function | No list query params for category or link type; KPI row does not break down by domain |
| **Create task from** a governance / finance / ingestion screen | No “Create task here” pattern wired to pre-fill `linked_resource_*` + `meta_json` |

---

## 2. Recommended direction: “platform link registry”

Treat every attachable surface as a **link kind** with:

1. **`link_kind`** — stable machine key (e.g. `revenue_weekly_submission`, `finance_validation_case`, `ingestion_batch`, `meeting`, `record`).
2. **Primary id** — stored in `linked_resource_id` (string is fine for composite keys use delimiter or JSON in `meta_json`).
3. **Optional `meta_json`** — `{ "fiscal_year": "FY2024-25", "week_start": "2026-04-14", "label": "Honeywell W15" }` for display and filters without extra DB columns per feature.
4. **Resolver** (frontend + optional backend) — `link_kind` + id → **route** + **human label** for cards and activity log.

This reuses existing columns; the main work is **convention + UI + optional validation**, not necessarily new tables.

### 2.1 Suggested `link_kind` values (expand over time)

Align with real routes and APIs in this app:

| `link_kind` (`linked_resource_type`) | Typical UI route | Notes |
|-------------------------------------|------------------|--------|
| `revenue_weekly_submission` | `/revenue-governance` (query or state to open row) | Matches weekly pack / governance flows |
| `revenue_tracker` | `/revenue-trackers` | If tasks attach to tracker config |
| `finance_validation` | `/finance-validation` | Row/case id from your validation model |
| `billing_workflow` | `/billing` | If you expose stable ids |
| `project` | `/clients/:id` or project drilldown | Already common in samples |
| `record` / `requisition` | Requisitions / record detail | Pick one canonical name |
| `meeting` | `/meetings` or future detail | MoM linkage |
| `sla_performance` | `/sla-performance` | Metric / period keys in `meta_json` |
| `wfm_snapshot` | `/wfm` | |
| `vendor_license` | `/vendor-licenses` | |
| `ingestion_batch` | `/ingestion` or data ops | |
| `task` | N/A | For subtasks only if you add hierarchy later |

**Add to `CATEGORIES`:** e.g. `revenue_pack` → label **“Revenue pack / governance”** distinct from generic **“Billing / revenue”**, so cards match user language.

---

## 3. Making the system “more comprehensive” (layers)

### Layer A — **Discoverability** (quick win)

- On cards: show **`task_subtype`** as a second line or chip (not only category).
- Replace raw `type:id` with **“Open in platform →”** link using a small **`taskDeepLink(linkKind, id, meta)`** map in `frontend/src/lib/` (or extend `api.ts`).
- Add **filter dropdowns**: category, link kind (distinct from category if needed), optional text search on title — **client-side first**; then add `GET /tasks?task_category=&linked_resource_type=` for large boards.

### Layer B — **Structured creation** (medium effort)

- In the task dialog: when user picks a **link kind**, show a **searchable picker** (reuse patterns from RevenueGovernance / project pickers): load options from existing APIs, write canonical `linked_resource_type` + `id` + `meta_json`.
- **“Create task”** buttons on **Revenue Governance**, **Finance Validation**, **Billing**, etc.: `navigate('/tasks?prefill=...')` or shared context to open dialog with fields set — same as meeting→task sync pattern in `MEETING_TASKS_TEAMS_INTEGRATION.md`.

### Layer C — **Integrity** (backend)

- Optional **`POST /tasks/validate-link`**: or validate inside `create_task` / `patch_task` when `linked_resource_type` is in an allow-list — resolve id exists and user has access (mirror `assert_project_access` patterns per resource).
- Prevents orphan links and strengthens trust in reporting.

### Layer D — **Reporting & admin**

- Extend **`GET /tasks`** with filters + CSV/export grouped by `task_category` + `linked_resource_type`.
- Activity log already supports `resource_type: task`; consider logging **link_kind** in summary for audit.

### Layer E — **Automation** (later)

- Rules: “when revenue pack status → submitted, create task for FP&A role” — workflow engine or small hooks in submission routers.

---

## 4. Revenue packs specifically

Weekly revenue / governance is centered on **`/revenue-governance`** and related types in `frontend/src/lib/api.ts` (`RevenueWeeklySubmissionDto`, etc.).

**Minimum viable attachment:**

1. Add category **`revenue_pack`** (or reuse `billing` with enforced subtype `revenue_weekly_pack` — less clear in UI).
2. Set `linked_resource_type = "revenue_weekly_submission"` and `linked_resource_id = String(submissionId)` (use the actual primary key from your API).
3. In `meta_json`, store `{ "fiscal_year_label": "...", "week_start": "..." }` for card subtitle if list API is heavy.
4. Deep link: `/revenue-governance?submissionId=123` (or whatever query the page already supports — add one if missing).

---

## 5. Risks and principles

| Risk | Mitigation |
|------|------------|
| Stringly-typed links drift | Published enum in shared TS + Python (single source or codegen) |
| Performance of pickers | Paginate search; don’t load all packs at once |
| Over-validation blocks power users | Allow “custom” link kind for admins only, or `adhoc` + `meta_json` |
| Duplicated tasks | Idempotent “create from source” keyed by `(link_kind, id, template)` |

---

## 6. Suggested delivery order

1. **Registry + deep links + subtype on cards** (Layer A) — immediate UX win.  
2. **New category + revenue pack picker + prefill from Revenue Governance** (A + B partial).  
3. **API list filters** for category / `linked_resource_type` (B + reporting).  
4. **Optional link validation** (Layer C) for high-stakes domains.  
5. **Cross-module “Create task”** on 2–3 highest-traffic screens (revenue, finance validation, ingestion).

---

## 7. Key files to touch (implementation checklist)

| Area | File(s) |
|------|---------|
| Task UI / board | `frontend/src/pages/Tasks.tsx` |
| Task types / queries | `frontend/src/lib/api.ts` |
| Task API | `backend/routers/tasks.py` |
| Task model | `backend/db/database.py` (only if you add columns; prefer `meta_json` first) |
| Revenue governance surface | `frontend/src/pages/RevenueGovernance.tsx` (+ route query for deep link) |

---

*This document is an analysis and roadmap only; it does not change runtime behaviour.*
