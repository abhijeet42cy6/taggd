# Revenue forecast & KPI governance — implementation status vs execution plan

**Reference:** [REVENUE_FORECAST_KPI_GOVERNANCE_EXECUTION_PLAN.md](./REVENUE_FORECAST_KPI_GOVERNANCE_EXECUTION_PLAN.md)  
**Purpose:** Record what has been built in the codebase (as of this document), what is partial, and what remains—especially whether **project heads** can submit **weekly revenue budget** vs **weekly revenue forecast** and how **approval** works.

**Document version:** 1.0

---

## Executive summary


| Area                                                         | Status                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Weekly “revenue pack” governance (Option A–style header)** | **Implemented** — `revenue_weekly_submission` + links from `revenue_forecast_weekly` and `revenue_visibility_snapshot`.                                                                                       |
| **Project head: weekly revenue forecast**                    | **In scope and implemented** — same TAGGD weekly forecast as before; saves attach to / create draft pack; submit locks edits pending finance.                                                                 |
| **Project head: weekly revenue budget**                      | **Not in this workflow** — there is **no** weekly `revenue_budget` entity or API under the pack. **Budget / forecast** remains on `**BudgetForecast`** / ledger paths, **outside** `RevenueWeeklySubmission`. |
| **Project head: revenue visibility**                         | **Implemented** — optional `week_start_date` on visibility upsert links snapshot to the same weekly pack.                                                                                                     |
| **Finance: approve / reject / request changes**              | **Implemented** — `/revenue-governance` UI + `/revenue-weekly-submissions/*` APIs.                                                                                                                            |
| **Weekly finance KPIs in the pack**                          | **Not implemented** — no `project_weekly_finance_kpi` or KPI blob on the submission.                                                                                                                          |
| **Client timeline, client cards, ClientDetail tab**          | **Partial** — client **summary** endpoint only; no full cards grid or `ClientDetail` tab.                                                                                                                     |


---

## Pillar 1 — Data & workflow (foundation)

### Step 1.1 — Definitions (product / BA)


| Plan item                                              | Status       | Notes                                                              |
| ------------------------------------------------------ | ------------ | ------------------------------------------------------------------ |
| Option A: one pack per `(project_id, week_start_date)` | **Done**     | Table `revenue_weekly_submission`, `period_type` default `weekly`. |
| Group forecast + visibility + weekly KPI subset        | **Partial**  | Forecast + visibility only; **no weekly KPI subset** in the pack.  |
| Monthly cadence / `period_type = monthly`              | **Not done** | Only `weekly` is used in code paths.                               |


### Step 1.2 — Schema


| Plan item                                                | Status       | Notes                                                                                                         |
| -------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Header: status, submit/review/approve fields, `version`  | **Done**     | Includes `review_notes`, `version`; no `content_hash`.                                                        |
| Unique `(project_id, week_start_date, period_type)`      | **Done**     | `uq_rev_weekly_submission`.                                                                                   |
| Link `RevenueForecastWeekly`                             | **Done**     | Column `weekly_submission_id`.                                                                                |
| Link `RevenueVisibilitySnapshot`                         | **Done**     | Column `weekly_submission_id`.                                                                                |
| Weekly finance KPI table / JSON                          | **Not done** | —                                                                                                             |
| `FinanceEfficiencyKPI` workflow                          | **Not done** | Still monthly / separate; not tied to weekly pack.                                                            |
| Indexes `(status, project_id)`, `(status, submitted_at)` | **Partial**  | `ix_rev_weekly_sub_status`, `ix_rev_weekly_sub_project`; composite queue indexes as in plan not all explicit. |
| Backfill legacy rows to `approved` / `legacy_untracked`  | **Not done** | Legacy rows have `weekly_submission_id` null until next save creates a pack.                                  |


### Step 1.3 — API contracts


| Plan item                                       | Status       | Notes                                                                                                          |
| ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Draft pack (explicit create)                    | **Implicit** | Draft created on first forecast save (or visibility save with `week_start_date`) for that week.                |
| Submit                                          | **Done**     | `POST /revenue-weekly-submissions/{id}/submit` — requires forecast row for that week.                          |
| Finance queue + filters                         | **Partial**  | `GET /queue` supports `status`, `client_id`, `project_id`; **no** date range or assignee filter.               |
| start-review, approve, request-changes, reject  | **Done**     | With notes body on request-changes / reject.                                                                   |
| Read APIs: timeline by `project_id` (paginated) | **Not done** | **Pack** is `GET …/pack?project_id=&week_start_date=` only (single week).                                      |
| By client: aggregate / cards                    | **Partial**  | `GET …/by-client/{client_id}/summary` returns `pending_count` + `project_ids` only.                            |
| Auth / vertical                                 | **Done**     | New vertical `revenue_kpi_governance` for queue and finance actions; pack read also allows `revenue_forecast`. |
| Webhooks                                        | **Not done** | —                                                                                                              |


### Step 1.4 — Audit


| Plan item                                    | Status       | Notes                                                                          |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `log_activity` on transitions                | **Done**     | Submit, approve, reject, updates; `resource_type` `revenue_weekly_submission`. |
| Immutable event rows (like billing workflow) | **Not done** | Activity log only.                                                             |
| Frontend `ActivityLog` label                 | **Done**     | `revenue_weekly_submission` → “Weekly revenue pack”.                           |


### Step 1.5 — Tests


| Plan item                       | Status       |
| ------------------------------- | ------------ |
| Unit / integration / load tests | **Not done** |


---

## Pillar 2 — Role-specific UX

### Step 2.1 — IA / entry points


| Plan item                                             | Status   | Notes                                                                                                        |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| PH entry: Revenue trackers                            | **Done** | Weekly pack strip + submit on `/revenue-trackers`.                                                           |
| Finance entry: Finance Command tab or dedicated route | **Done** | `**/revenue-governance`** + Finance Command tab **“Forecast packs”** (link to queue).                        |
| Nav / vertical gating                                 | **Done** | `revenue_kpi_governance`, `ROLE_NAV_PATHS`, `navAllowedForRole`, `VERTICAL_TO_NAV_PATHS`, AdminUsers module. |


### Step 2.2 — Project head UI (plan checklist)


| #   | Plan step                                       | Status       | Notes                                                                                                                       |
| --- | ----------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Assignments strip                               | **Partial**  | Existing project scope dropdown; no dedicated “assignments” strip for packs.                                                |
| 2   | Week picker + badge per project                 | **Partial**  | Week picker + status for **one** focused project (`project filter` or first project); not a matrix of all projects × weeks. |
| 3   | Editor reuse + draft pack                       | **Done**     | Forecast dialog unchanged except errors; visibility sends `week_start_date` when governance week set.                       |
| 4   | Submit for review                               | **Done**     | “Submit pack for finance” when role allows (`canPracticeSubmitBilling` pattern).                                            |
| 5   | Cross-project “what I’ve filled” table/calendar | **Not done** | —                                                                                                                           |
| 6   | Approved read-only + diff                       | **Partial**  | Approver + timestamp shown in strip when approved; **no** diff view.                                                        |


### Step 2.3 — Finance operator UI


| #   | Plan step                          | Status       | Notes                                                                      |
| --- | ---------------------------------- | ------------ | -------------------------------------------------------------------------- |
| 1   | Client card grid                   | **Not done** | Summary API exists; **no** card UI consuming it on `/revenue-governance`.  |
| 2   | Filters (PM, week, status)         | **Partial**  | Status filter only on queue page.                                          |
| 3   | Client drill-down + week timeline  | **Not done** | —                                                                          |
| 4   | Week detail side-by-side + actions | **Partial**  | Drawer shows JSON for submission / forecast / visibility + action buttons. |
| 5   | Bulk approve                       | **Not done** | —                                                                          |


### Steps 2.4–2.5 — Shared components & UX review


| Plan item                                    | Status                            |
| -------------------------------------------- | --------------------------------- |
| Dedicated status badge / timeline components | **Not done** (inline text / JSON) |
| Formal usability / a11y pass                 | **Not done**                      |


---

## Pillar 3 — Existing screens


| Plan section               | Status                | Notes                                                                                                                                                 |
| -------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3.1 Finance Command**    | **Partial**           | Tab **“Forecast packs”** + link to `/revenue-governance`. No embedded queue; ledger unchanged.                                                        |
| **3.2 Revenue trackers**   | **Partial**           | Pack strip + governance week link for visibility; **no** “Enter vs status” toggle; charts **not** filtered to approved-only; no client timeline link. |
| **3.3 Budget & forecast**  | **Not done**          | No UI copy or linkage from `BudgetForecast` to weekly pack; **weekly revenue budget is not part of the submission object.**                           |
| **3.4 Client detail**      | **Not done**          | No new tab for governance timeline / pending list.                                                                                                    |
| **3.5 Billing validation** | **Unchanged vs plan** | Still **“Finance validation”** in nav in places; plan suggested rename to avoid confusion—**not** applied in this implementation pass.                |


---

## Pillar 4 — Naming, navigation, rollout


| Plan step                                           | Status       | Notes                                                                      |
| --------------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| Rename “Finance validation” → billing-focused label | **Not done** | Both **Finance validation** and **Revenue packs** can appear in Analytics. |
| New route for forecast governance                   | **Done**     | `/revenue-governance`.                                                     |
| Activity log labels                                 | **Done**     | See Pillar 1.4.                                                            |
| Vertical in admin + backend `VERTICAL_KEYS`         | **Done**     | `revenue_kpi_governance`.                                                  |
| Release notes / FAQ / feature flag / pilot          | **Not done** | No feature flag; workflow is always on once DB migration ran.              |


---

## Cross-pillar slices (plan § suggested order)


| Slice  | Plan                                           | Status                                                       |
| ------ | ---------------------------------------------- | ------------------------------------------------------------ |
| **S1** | Header + APIs + activity                       | **Done** (minus automated tests).                            |
| **S2** | PH: trackers + draft/submit + cross-week table | **Partial** (submit + strip; **no** cross-week matrix).      |
| **S3** | Finance: cards + client timeline               | **Not done** (queue table + drawer only).                    |
| **S4** | Finance Command + Client detail                | **Partial** / **not done** (tab link only; no ClientDetail). |
| **S5** | Naming + docs + flag                           | **Partial** (this doc + code; no rename/flag/FAQ).           |
| **S6** | Monthly packs / BudgetForecast linkage         | **Not done**                                                 |


---

## Clarification: “Weekly revenue budget” vs “Weekly revenue forecast”

The execution plan and product language mix **weekly TAGGD forecast**, **monthly / FY budget**, and **finance KPIs**. In **this implementation**:

1. `**RevenueForecastWeekly` (revenue trackers “weekly forecast”)**
  - This is the **weekly revenue forecast** path (amounts in Lakhs via API, stored INR).  
  - It **is** governed by `**RevenueWeeklySubmission`**: saving a row creates/attaches a **draft** pack; after **submit / under review / approved**, edits are **423 locked** until finance returns to `changes_requested` / `rejected` (editable) or similar.
2. `**revenue_budget` / budget workbook / `BudgetForecast` page**
  - **Not** wired into `RevenueWeeklySubmission`.  
  - Project heads **do not** submit “weekly revenue budget” through this pack; budget/forecast ingestion remains **separate** (e.g. budget-forecast upload, ledger).  
  - To align with the plan’s **S6**, a future change would define whether **budget lines** join the same pack or stay a **separate** approval with cross-links in UI.
3. `**RevenueVisibilitySnapshot`**
  - **Optional** link to the weekly pack via `**week_start_date`** on the visibility upsert (and UI hint on Revenue trackers when a governance week is selected).
4. **Submit eligibility (practice)**
  - Backend mirrors the **billing submit** style: platform admin, executive, project head, and **operations** with `**revenue_forecast`** vertical may submit packs (see `revenue_weekly_submission.py` `_practice_may_submit_weekly_pack`).
5. **Finance approval**
  - Requires `**revenue_kpi_governance`** (with the same `profile_may_access_vertical` rules as other verticals—executives bypass; operations need the vertical in `vertical_access_json`).

---

## Primary code references (implementation)


| Component                          | Location                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| DB model + SQLite migration helper | `backend/db/database.py` (`RevenueWeeklySubmission`, FK columns), `_ensure_revenue_weekly_submission_schema()` |
| Status helpers                     | `backend/core/revenue_weekly_submission_core.py`                                                               |
| Governance API                     | `backend/routers/revenue_weekly_submission.py`                                                                 |
| Forecast/visibility attach + lock  | `backend/routers/revenue_trackers.py`                                                                          |
| Router registration                | `backend/main.py`                                                                                              |
| Vertical key                       | `backend/auth/profile.py` (`VERTICAL_KEYS`)                                                                    |
| PH / pack UI                       | `frontend/src/pages/RevenueTrackers.tsx`                                                                       |
| Finance queue UI                   | `frontend/src/pages/RevenueGovernance.tsx`                                                                     |
| API client                         | `frontend/src/lib/api.ts`                                                                                      |
| Nav / access                       | `frontend/src/lib/auth.tsx`, `frontend/src/App.tsx`                                                            |
| Finance Command entry              | `frontend/src/pages/FiscalPerformance.tsx`                                                                     |
| Admin module                       | `frontend/src/pages/AdminUsers.tsx`                                                                            |
| Activity log label                 | `frontend/src/pages/ActivityLog.tsx`                                                                           |


---

## Risks called out in the plan — current posture


| Risk                                            | Current posture                                                                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft vs approved mixed in dashboards           | **Open** — Revenue tracker charts still aggregate **all** forecast rows; they do **not** filter to “approved pack only”.                                                                             |
| Scope creep on KPIs                             | **Mitigated** — only forecast + optional visibility in v1.                                                                                                                                           |
| Role confusion (billing vs forecast governance) | **Partially open** — distinct routes (`/finance-validation` vs `/revenue-governance`) help; **“Finance validation”** naming vs **“Revenue packs”** still benefits from the plan’s rename (Pillar 4). |


---

## Suggested next steps (if continuing to match the plan)

1. `**GET` timeline** — `…/by-project/{project_id}/submissions?limit&offset` for week-by-week history.
2. **Client hub** — Use `by-client/.../summary` in a **card grid** on `/revenue-governance` or a client sub-route.
3. `**ClientDetail` tab** — “Revenue & forecast governance” with timeline + pending list + scope for PH.
4. **Charts** — Toggle or default to **approved** weeks only for executive views.
5. **Budget / weekly budget** — Product decision + **S6**: either link `BudgetForecast` in copy only, or extend pack with `period_type` / separate budget submission entity.
6. **Tests** — Transition matrix + project scope **403** on pack APIs.
7. **Rename** — “Finance validation” → “Billing validation” (or equivalent) per Pillar 4.

---

*This file is the implementation record; update it when slices S3–S6 or Pillar 4 renames land.*