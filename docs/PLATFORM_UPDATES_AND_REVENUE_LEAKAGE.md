# Platform updates and Revenue Leakage tab

This document summarizes product and engineering changes delivered across the Control Centre workspace, with emphasis on the **Revenue Leakage** tab, data sources, and how the UI ties to the database.

---

## 1. Executive summary


| Area                    | Summary                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SLA Performance**     | SLA metric form moved to a right-hand sheet with tabs; advanced filters redesigned (collapsible, month range, Notion-style pickers); Industry Benchmarking subtab removed. |
| **Company values**      | Post-login modal with PRD copy (Purpose / Mission / Vision): `CompanyValuesModal` + session flag set on successful `login()`; see §3.                                      |
| **My profile**          | Profile page restyled toward a Notion-style layout, using design tokens and `profile-page.css`.                                                                            |
| **Revenue Leakage**     | New primary nav under Analytics; dedicated page and `GET /revenue-leakage` API; metrics derived from `records` + `additional_attributes` for cancelled requisitions.       |
| **Navigation / access** | `ROLE_NAV_PATHS` in `auth.tsx` extended so `/revenue-leakage` appears for staff roles that already see analytics modules.                                                  |


---

## 2. SLA Performance (high level)

- **SLA metric form** (`SlaMetricFormDialog.tsx`): Switched from a centered modal to a **right-sheet** pattern aligned with “new contract” (classes such as `new-contract-sheet`, `ncp-scroll`, `ncp-page`), with **tabs** and sectioned fields.
- **Metric nature** field: Dropdown with fixed options: Contractual, Non-Contratual, Penalty, Non-Penatly, Internal (plus legacy value if stored value is not in the list).
- **Advanced filters** (`SLAPerformance.tsx` + `sla-dash-ui.css`): Restructured layout; regional head and region use **Notion-style multi pickers** (`SlaMultiStringPicker`); project on its own row; **month range** via two `input type="month"` controls; section **collapsed by default** with accessible toggle.
- **Industry Benchmarking** subtab removed from SLA navigation and related views.

Related styles: `new-contract-panel.css`, `sla-dash-ui.css`, `SlaGlobalFilterPickers.tsx` (includes `SlaMultiStringPicker`).

---

## 3. Company values modal (login)

- **Why it was missing earlier:** The behavior was specified in the PRD but not wired in the React app.
- **Behavior:** After a successful **password** login, `auth.tsx` sets `sessionStorage["tgddata_show_company_values"] = "1"` (see `COMPANY_VALUES_SESSION_FLAG` in `frontend/src/lib/company-values.ts`).
- **Presentation:** `AuthenticatedApp` mounts `CompanyValuesModal` (Radix `Dialog`) so it appears even when `AppShell` first renders a `<Navigate />` (e.g. recruiter redirect). When the flag is set and a user id exists, the modal opens; **Continue** or overlay dismiss clears the flag so it does not repeat on refresh in the same session.
- **Frequency:** Once per successful login in this browser tab (session storage cleared after dismiss). A full **re-login** runs `login()` again and shows the modal again.
- **Copy:** Matches `docs/TAGGD_VALUES_AND_REVENUE_LEAKAGE_PRD.md` §2.3 (Purpose, Mission, Vision line breaks).
- **Note:** Loading the app with an **existing token** (e.g. refresh without logging out) does not call `login()` — no modal until the next explicit sign-in.

---

## 4. My profile

- **Profile page** (`Profile.tsx` + `profile-page.css`): Layout and typography aligned with the design-system / `design_style_guide.html` patterns (section cards, field rows, tags for roles/modules).
- Displays contact, access, and permission summaries in a structured, readable layout.

---

## 5. Product requirements (PRD)

- `**docs/TAGGD_VALUES_AND_REVENUE_LEAKAGE_PRD.md`**: Describes the login values modal; Revenue Leakage definitions (position tracker, cancelled reqs, revenue ageing, 48h rule, source of hire); open questions and acceptance criteria.  
- This implementation doc is the **engineering companion** to that PRD: it describes what was actually built and how data is mapped.

---

## 6. Revenue Leakage tab

### 6.1 User-facing behavior

- **Route:** `/revenue-leakage`
- **Navigation:** Sidebar → **Analytics** → **Revenue Leakage** (icon: `TrendingDown` from Lucide).
- **Page** (`frontend/src/pages/RevenueLeakage.tsx`):
  - Page header and short description of metrics.
  - **Filters:** month (`YYYY-MM`), optional project/account, optional source-of-hire filter; Apply / Clear.
  - **KPI strip:** cancelled count, average ageing, 48h pipeline SLA %, RPO share (where applicable).
  - **Charts / panels:** ageing bucket distribution; 48h SLA ring + legend; source-of-hire mix (beneficial vs loss); **top cancellation reasons** (when data exists).
  - **Table:** sortable columns (req number, position, hiring manager, recruiter, dates, ageing, bucket, SLA, cancel reason, source, commercial class); pagination; row click opens a **detail drawer** with timeline and key fields.

### 6.2 Backend API

- **Endpoint:** `GET /revenue-leakage`  
- **Query parameters:**
  - `month` (optional): `YYYY-MM` — filters by `**records.creation_date`** falling in that calendar month.
  - `project_id` (optional): restricts to a project (subject to access checks).
  - `source_of_hire` (optional): comma-separated labels to filter rows.
- **Auth / scope:** Same record scoping as other record APIs (`scoped_clause_record`, `apply_recruiter_record_scope`, `assert_project_access` when appropriate).
- **Response shape (conceptual):**
  - `summary`: totals, averages, SLA counts and percentage.
  - `ageing_buckets`: counts for `0-2`, `3-5`, `6-9`, `>10`, `No data`.
  - `source_of_hire`: label, count, `commercial_class` (Beneficial for RPO, Loss for others in this model).
  - `cancel_reasons`: top cancellation reasons with counts.
  - `rows`: per-requisition detail objects (see types in `frontend/src/lib/api.ts`).

Implementation lives in `backend/main.py` (search for `get_revenue_leakage` and helpers `_rl_*`).

### 6.3 Definitions implemented in code (v1)


| Concept                    | Implementation                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cancelled requisitions** | `Record.status == "Canceled"` (single `d` in the source data). **Not** `global_status == "CANCELLED"` — that value does not exist in the current dataset for this population.                                                 |
| **Monthly cohort**         | Rows whose `**creation_date`** falls in the selected month (when `month` is provided).                                                                                                                                        |
| **Revenue ageing (days)**  | Prefer `**Approved Date` − `Intake Meeting Date`** when both exist in `additional_attributes`. If not, **fallback** to numeric `**Days Open`** from `additional_attributes` so rows still contribute to averages and buckets. |
| **Ageing buckets**         | `0-2`, `3-5`, `6-9`, `>10`, `No data` (inclusive upper bounds on day counts for the first four).                                                                                                                              |
| **48h “pipeline” SLA**     | Elapsed **working** time from `**creation_date`** to `**Approved Date`** (Mon–Fri, simplified hour model). Met if ≤ 48 working hours; otherwise Not Met; missing dates → No Data.                                             |
| **Source of hire**         | Derived from `**Direct/Indirect`** in `additional_attributes`: **Indirect** → **RPO** (treated as beneficial); **Direct** → **Direct** (loss in this framing); limited fallbacks via **Recruiting Type** when needed.         |
| **Commercial class**       | **RPO** → Beneficial; **Direct** / **Unknown** → Loss (aligned with the PRD’s “RPO vs rest” framing for this dashboard).                                                                                                      |


### 6.4 Data source of truth (database)

All analytics read from existing tables; **no separate “leakage” table** was added.


| Data need                                                                          | Where it lives                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Row identity, project, dates on the record                                         | `records` table (`creation_date`, `status`, `global_status`, etc.)                             |
| Intake, approval, days open, cancel reason, req number, recruiter, direct/indirect | `records.additional_attributes` (JSON), keys documented in the `get_revenue_leakage` docstring |


**Important:** In this deployment, `records.intake_date`, `records.first_cv_share_date`, and `records.rpo_source_of_hire` are **largely unpopulated** for the ingested requisition set. The dashboard therefore **does not** rely on those columns for v1; it uses `**additional_attributes`** so cancelled requisitions show real numbers and reasons.

### 6.5 Frontend types and client

- `**frontend/src/lib/api.ts`:** `RevenueLeakageRow`, `RevenueLeakageResponse`, `revenueLeakageApi.get()`.
- `**frontend/src/styles/revenue-leakage.css`:** Scoped styles under `.rl-`* using platform CSS variables.

### 6.6 Navigation visibility (fix)

The route and nav label were added in `App.tsx`, but the sidebar **filters** items through `navAllowedForRole()` using `**ROLE_NAV_PATHS`** in `frontend/src/lib/auth.tsx`.  
**Change:** `/revenue-leakage` was added to each relevant role list (`admin`, `platform_admin`, `executive`, `project_head`, `manager`, `operations`) so the tab appears for the same users who can see other Analytics items. **Recruiter** IA was unchanged (analytics-heavy routes are not in the recruiter group by design).

---

## 7. File reference (Revenue Leakage)


| File                                             | Role                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `backend/main.py`                                | `GET /revenue-leakage`, helpers `_rl_parse_date`, `_rl_working_hours`, `_rl_ageing_bucket`, `_rl_soh_label` |
| `frontend/src/pages/RevenueLeakage.tsx`          | Page UI, filters, KPIs, charts, table, drawer                                                               |
| `frontend/src/styles/revenue-leakage.css`        | Page styling                                                                                                |
| `frontend/src/lib/api.ts`                        | Types + `revenueLeakageApi`                                                                                 |
| `frontend/src/App.tsx`                           | Route + nav + icon                                                                                          |
| `frontend/src/lib/auth.tsx`                      | `ROLE_NAV_PATHS` for `/revenue-leakage`; sets session flag after `login()` for company values modal         |
| `frontend/src/components/CompanyValuesModal.tsx` | Purpose / Mission / Vision dialog                                                                           |
| `frontend/src/lib/company-values.ts`             | `COMPANY_VALUES_SESSION_FLAG` storage key                                                                   |
| `docs/TAGGD_VALUES_AND_REVENUE_LEAKAGE_PRD.md`   | Original PRD (values modal + revenue leakage product spec)                                                  |


---

## 8. Future improvements (optional)

- **Align ageing** with finance if the business wants **calendar** vs **business** days only, or to use `first_cv_share_date` once backfilled from ATS.
- **RPO vs Direct** mapping from `Direct/Indirect` may need refinement if product defines **External Requisition**, **Internal Job Portal**, and **Transferred** at the same granularity as the PRD (those may require richer source fields or `source_joiner_type` when populated).
- **Holidays** in the 48h working-hours rule (currently weekdays only).
- **Company values frequency** — optional “once per day” via `localStorage` if product wants fewer repeats than every login.

---

## 9. Document control


| Item              | Detail                                         |
| ----------------- | ---------------------------------------------- |
| **Title**         | Platform updates and Revenue Leakage tab       |
| **Location**      | `docs/PLATFORM_UPDATES_AND_REVENUE_LEAKAGE.md` |
| **Companion PRD** | `docs/TAGGD_VALUES_AND_REVENUE_LEAKAGE_PRD.md` |


---

*End of document.*