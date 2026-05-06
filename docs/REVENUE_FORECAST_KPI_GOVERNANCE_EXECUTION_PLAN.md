# Revenue forecast & KPI governance — execution plan

This document is a **step-by-step playbook** to implement the four pillars discussed for aligning **project-head submissions** (weekly forecasts, weekly finance KPIs, monthly visibility / revenue trackers) with **finance-operator review and approval**, plus **client-centric** views for finance and **cross-account** visibility for project heads.

**Scope reminder:** Today, **Finance validation** (`/finance-validation`) is **TAGGD billing row** workflow only. This plan adds a **parallel governance track** for forecast/KPI cadence without conflating it with invoice lifecycle unless you explicitly merge them later.

---

## Pillar 1 — Data & workflow (foundation)

**Goal:** Every weekly (and optionally monthly) submission has an explicit lifecycle: **draft → submitted → under review → approved / changes requested / rejected**, with **audit fields** (who, when, comments) so UI can show “approved by which finance user” and week-by-week history.

### Step 1.1 — Freeze definitions (product / BA)

1. **Define the atomic unit of submission** (pick one primary model):
  - **Option A (recommended):** One **“Weekly revenue pack”** per `(project_id, week_start_date)` that groups *forecast weekly row*, *visibility snapshot* (if present), and *weekly KPI subset* under one `submission_id` / status.
  - **Option B:** Separate approval per artifact (forecast vs visibility vs KPIs) with linked foreign keys — more flexible, heavier UX and queries.
2. **List fields** that must move together when the pack is submitted (e.g. net revenue, counts, remarks, visibility as-of, selected KPI lines).
3. **Define roles** who can: create draft, submit, approve, reject, request changes, and **view approved history** (project head read-only vs finance vs executive).
4. **Decide monthly cadence:** whether **monthly revenue tracker / visibility uploads** use the **same** state machine with `period_type = monthly` or a **separate** table and API namespace.

**Exit criteria:** One-page spec signed off: entity name, states, role matrix, period types.

### Step 1.2 — Schema design (DB)

1. If **Option A**: add a header table, e.g. `revenue_weekly_submission` (names illustrative):
  - `id`, `project_id`, `week_start_date`, `period_type` (`weekly` | `monthly` if unified)
  - `status` (`draft` | `submitted` | `under_review` | `approved` | `changes_requested` | `rejected`)
  - `submitted_by_user_id`, `submitted_at`
  - `reviewed_by_user_id` (or separate junior/senior if needed), `reviewed_at`, `review_notes`
  - `approved_by_user_id`, `approved_at` (or reuse `reviewed_`* for single approver)
  - `version` or `content_hash` (optional, for tamper-evident “what was approved”)
  - Unique constraint on `(project_id, week_start_date, period_type)` (or equivalent).
2. **Link** existing rows:
  - `RevenueForecastWeekly`: add nullable `submission_id` FK **or** keep `project_id` + `week_start_date` and resolve pack by join; avoid duplicate sources of truth.
  - `RevenueVisibilitySnapshot`: same pattern for the as-of row that belongs to that week’s pack.
  - **Weekly finance KPIs:** either new table `project_weekly_finance_kpi` keyed by `(project_id, week_start_date)` or JSON blob on the submission header — choose based on reporting needs.
3. **FinanceEfficiencyKPI:** decide if it stays **monthly-only** with its **own** small workflow (`draft`/`approved`) or is **referenced** from a monthly pack only; do **not** overload `approved_headcount` as workflow state.
4. Add **indexes**: `(status, project_id)`, `(status, submitted_at)` for queues; `(project_id, week_start_date)` for timelines.
5. Plan **migration** for existing rows: backfill `submission_id` with status `approved` and `approved_at = updated_at` **or** `legacy_untracked` so old data does not block new workflow.

**Exit criteria:** ERD + migration script reviewed; no circular FKs; rollback plan noted.

### Step 1.3 — API contracts (backend)

1. **Submission CRUD:**
  - Create / upsert **draft** pack (project head, scoped by `assert_project_access`).
  - **Submit** transition: validate required fields, set `submitted_`*, append **activity log** event.
2. **Finance queue:**
  - List submissions filtered by `status`, `client_id` / `project_id`, date range, assignee (if you add assignment).
3. **Review actions:**
  - `POST .../start-review`, `approve`, `request-changes`, `reject` — each validates current `status`, sets actor + timestamp, optional notes.
4. **Read APIs for timelines:**
  - By `project_id`: all weeks with `status`, submitter, approver, timestamps (paginated).
  - By `client_id` (account): aggregate projects under client — for finance cards.
5. **Authorization:** reuse `require_vertical` / `profile_may_access_vertical` patterns:
  - e.g. new vertical `revenue_kpi_governance` **or** reuse `finance` + `revenue_forecast` with explicit checks — document which.
6. **Webhooks / notifications (optional phase 2):** email or in-app when submitted or approved.

**Exit criteria:** OpenAPI or route list + example payloads; 403 matrix documented.

### Step 1.4 — Audit & activity log

1. Emit **activity log** entries on submit, approve, reject, request-changes (reuse `log_activity` + `RESOURCE_TYPE_LABEL` on frontend).
2. Optionally append **immutable event rows** (like `FinanceBillingValidationEvent`) if you need richer payloads than activity log.

**Exit criteria:** Activity log shows human-readable lines for each transition.

### Step 1.5 — Tests & data integrity

1. Unit tests: invalid transitions (e.g. approve from `draft`).
2. Integration tests: PH scoped project cannot read another project’s draft.
3. Load test (light): queue query with 10k rows indexed.

**Exit criteria:** CI green; manual test checklist passed.

---

## Pillar 2 — Role-specific UX (practice vs finance)

**Goal:** **Same underlying APIs**, **different shells**: project heads see **my work / my clients / submit / history**; finance sees **client cards, pending counts, drill-down to week timeline**.

### Step 2.1 — Information architecture

1. Decide **entry points:**
  - **Project head:** primary entry from **Revenue trackers** (`/revenue-trackers`) **or** new **“My revenue & KPIs”** route — pick one to avoid split brain.
  - **Finance operator:** primary entry from **Finance Command** (`/finance`) **new tab** **or** dedicated `/revenue-governance` — pick based on whether non-finance roles should never land on Finance Command.
2. **Navigation:** add items only for roles/verticals that need them; mirror existing `navAllowedForRole` + vertical patterns (same as billing validation gating).

**Exit criteria:** Nav tree diagram; no orphan routes.

### Step 2.2 — Project head UI (step-by-step build order)

1. **Assignments strip:** list projects user can edit (reuse project scope from `/auth/me` + assignments).
2. **Week picker:** default current fiscal week; show **draft / submitted / approved** badge per project for selected week.
3. **Editor:** reuse existing forecast + visibility forms; on save, write to **draft pack** (or auto-save draft child rows until pack exists).
4. **Submit for review:** single primary button; disabled until validation passes; call submit API.
5. **Cross-project “What I’ve filled”:** table or compact calendar: columns = week, projects as rows or vice versa; cells show status + link to open editor.
6. **Approved read-only view:** show approver name, date, optional diff vs current draft (phase 2).

**Exit criteria:** PH user can complete full loop without touching finance screens.

### Step 2.3 — Finance operator UI (step-by-step build order)

1. **Landing:** grid of **client (account) cards**: name, **pending submission count**, last approved week, optional risk flag from visibility `status`.
2. **Filters:** by PM/project head, by week, by status.
3. **Client drill-down page** (new route or tab): list **projects** under client; each row shows **latest pack status** + link to **week timeline**.
4. **Week detail:** side-by-side **submitted values** + **finance comment** + actions (approve / request changes / reject).
5. **Bulk actions (optional):** approve multiple low-risk packs with same client — guard with permission flag.

**Exit criteria:** Finance user never needs project head nav to clear a queue.

### Step 2.4 — Shared components

1. **Status badge** component: colors for draft / submitted / under review / approved / changes requested / rejected.
2. **User attribution line:** “Submitted by X on …” / “Approved by Y on …”.
3. **Week timeline** component: used on client page and optionally project head history.

**Exit criteria:** Design system tokens match existing platform CSS variables.

### Step 2.5 — UX review & accessibility

1. Keyboard flow for submit and approve.
2. Empty states: no assignments, no pending queue, all approved for week.
3. Mobile: card layout stacks; table has horizontal scroll on small screens.

**Exit criteria:** Short usability session with 1 PH + 1 finance user on staging.

---

## Pillar 3 — Where each existing screen fits after redesign

**Goal:** **Finance Command**, **Revenue trackers**, **Budget/forecast**, and **Client detail** each have a clear, non-overlapping job; deep links tie them together.

### Step 3.1 — Finance Command (`FiscalPerformance`, `/finance`)


| Step  | Action                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1.1 | **Preserve** current tabs: Overview, ledger, productivity, etc. — no regression on finance uploads.                                                          |
| 3.1.2 | **Add** a tab **“Governance”** or **“Forecast approvals”** that embeds the **finance queue** (or iframe-style route segment) filtered to pending-first.      |
| 3.1.3 | From ledger / KPI context, add **deep links** to the **same client’s** governance timeline when a variance ties to a pending submission (optional, phase 2). |
| 3.1.4 | Document **data dependencies**: approved weekly packs may **feed** or **annotate** ledger narrative in docs only until product wants auto-flags.             |


**Exit criteria:** Finance users open Finance Command and reach the queue in ≤2 clicks.

### Step 3.2 — Revenue trackers (`RevenueTrackers.tsx`, `/revenue-trackers`)

**Shipped (forecast tab):** **AMJ quarter lens** — The **Revenue forecast** tab shows a **Quarter summary · AMJ** strip: total forecast, total MMF, open requisition + opening fee, and joiners + joining fee, all **aggregated over Apr–Jun** of the Indian FY derived from the selected **governance week**. The **Revenue forecast vs MMF · AMJ** chart plots those three months (missing months show as zero). Full **monthly roll-up** and **weekly entries** tables are unchanged.

| Step  | Action                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.1 | **Introduce** a sub-nav or top toggle: **“Enter data”** vs **“Submission status”** (or role-based default: PH → status-first).                             |
| 3.2.2 | Wire all saves through **pack draft** logic when workflow enabled for tenant (feature flag).                                                               |
| 3.2.3 | **Charts:** filter to **last approved** week vs **latest draft** only when toggled — avoid mixing unapproved numbers into executive charts (configurable). |
| 3.2.4 | Link **“Open in client timeline”** if user has access to client-level route.                                                                               |


**Exit criteria:** PH sees submission state without opening Finance Command.

### Step 3.3 — Budget & forecast (`BudgetForecast.tsx`, `/budget-forecast` or embedded)


| Step  | Action                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3.1 | **Document relationship** in UI copy: **annual budget** vs **weekly TAGGD forecast** — one sentence in page header.                                                     |
| 3.3.2 | If product wants **one bundle approval**: extend monthly **pack** type; else keep **separate** approval and show **cross-links** (“Week 12 forecast vs budget line …”). |
| 3.3.3 | Avoid duplicating forecast numbers; prefer **read-only comparison** widgets pulling from approved weekly API.                                                           |


**Exit criteria:** No two conflicting “sources of truth” labels without explanation on screen.

### Step 3.4 — Client detail (`ClientDetail.tsx`, `/clients/:id`)


| Step  | Action                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 3.4.1 | Add a **new tab** (e.g. **“Revenue & forecast governance”**) visible to roles with `revenue_forecast` and/or finance verticals. |
| 3.4.2 | **Section A:** Week-by-week **timeline** (all projects under this client) — approved rows expanded; pending highlighted.        |
| 3.4.3 | **Section B:** **Project head** filter — show which PM submitted which week.                                                    |
| 3.4.4 | **Section C:** **Pending approvals** list for this client only (finance-primary).                                               |
| 3.4.5 | Respect **project scope** for non-finance users (PH sees only their projects inside the client).                                |


**Exit criteria:** Client page answers “what happened each week for this account?” in one scroll.

### Step 3.5 — Billing validation (`/finance-validation`) — coexistence


| Step  | Action                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.5.1 | **Rename in UI** if needed (see Pillar 4) so users do not think weekly KPIs live here.                                                                |
| 3.5.2 | Optional **cross-link** from billing row to **project’s** weekly timeline (deep link with query `?week=`), only when product wants that traceability. |


**Exit criteria:** Support docs list both “Billing validation” and “Forecast governance” with distinct URLs.

---

## Pillar 4 — Naming, navigation & clarity

**Goal:** Users never confuse **invoice/billing validation** with **forecast & KPI approval**; verticals and routes are discoverable.

### Step 4.1 — Naming (copy & routes)


| Step  | Action                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.1 | **Rename** sidebar label: e.g. current **“Finance validation”** → **“Billing validation”** or **“Invoice review”** if scope stays billing-only.            |
| 4.1.2 | **New route** for forecast/KPI governance, e.g. `/revenue-governance` or `/forecast-approvals` — name should say **forecast/KPI**, not “validation” alone. |
| 4.1.3 | Update **Activity log** resource type labels for new entities (mirror `finance_billing_workflow` pattern).                                                 |


**Exit criteria:** Stakeholder sign-off on strings; no two items both called “Finance validation”.

### Step 4.2 — Verticals & admin (`AdminUsers`, `VERTICAL_KEYS`)


| Step  | Action                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2.1 | Add vertical key(s), e.g. `revenue_kpi_governance` or split **submit** vs **approve** if needed (prefer **one** vertical with role checks unless compliance requires split). |
| 4.2.2 | Sync **frontend** `VERTICAL_MODULES`, `VERTICAL_TO_NAV_PATHS`, `ROLE_NAV_PATHS`, `navAllowedForRole` rules — same pattern as `finance_validation`.                           |
| 4.2.3 | **Backend** `VERTICAL_KEYS` in `auth/profile.py` + any `require_vertical` dependencies.                                                                                      |


**Exit criteria:** Admin can grant module access without developer editing JSON by hand.

### Step 4.3 — Training & rollout


| Step  | Action                                                                                    |
| ----- | ----------------------------------------------------------------------------------------- |
| 4.3.1 | **Release notes:** what changed for PH vs finance vs executives.                          |
| 4.3.2 | **Migration window:** feature flag off until backfill complete; then pilot on one client. |
| 4.3.3 | **Support FAQ:** “Where do I approve invoices?” vs “Where do I approve weekly forecasts?” |


**Exit criteria:** Pilot client sign-off; flag default-on for new tenants only if desired.

---

## Suggested execution order (cross-pillar)

Run work in **vertical slices** so each slice is demoable:


| Slice  | Delivers                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| **S1** | Pillar 1 minimal: header table + status + submit/approve APIs + activity log (no new UI beyond a debug page or Postman). |
| **S2** | Pillar 2 PH: Revenue trackers + draft/submit + cross-week table.                                                         |
| **S3** | Pillar 2 Finance: client cards + client timeline + approve actions.                                                      |
| **S4** | Pillar 3: Finance Command tab + Client detail tab linking to S3.                                                         |
| **S5** | Pillar 4: rename routes/labels + verticals + docs + flag rollout.                                                        |
| **S6** | Monthly packs / BudgetForecast linkage (if in scope).                                                                    |


---

## Dependencies & risks


| Risk                                                | Mitigation                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Duplicate numbers (draft vs approved) on dashboards | Default charts to **approved** only; explicit toggle for “include draft”.       |
| Scope creep (every KPI in v1)                       | Ship **weekly forecast + one KPI block** first; add visibility + monthly in S6. |
| Performance on client timeline                      | Server-side aggregation endpoint; pagination by week.                           |
| Role confusion                                      | Pillar 4 naming + separate routes.                                              |


---

## Appendix — Code anchors (for implementers)


| Topic                        | Likely touchpoints                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Weekly forecast API          | `backend/routers/revenue_trackers.py`, model `RevenueForecastWeekly`                        |
| Visibility API               | Same router / `RevenueVisibilitySnapshot`                                                   |
| Finance Command UI           | `frontend/src/pages/FiscalPerformance.tsx`                                                  |
| Revenue trackers UI          | `frontend/src/pages/RevenueTrackers.tsx`                                                    |
| Client shell                 | `frontend/src/pages/ClientDetail.tsx`                                                       |
| Billing workflow (reference) | `backend/routers/finance_billing_workflow.py`, `frontend/src/pages/FinanceValidation.tsx`   |
| Auth / verticals             | `backend/auth/profile.py`, `frontend/src/lib/auth.tsx`, `frontend/src/pages/AdminUsers.tsx` |


---

*Document version: 1.0 — aligns with governance discussion; adjust slice order to match team capacity.*