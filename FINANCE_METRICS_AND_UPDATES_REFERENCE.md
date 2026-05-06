# Finance metrics, KPIs, and revenue — how data is stored, updated, and calculated

This document describes the **current** behavior of the corporate finance stack in this repository: database tables, Excel ingest, API endpoints, derived formulas, deduplication rules, and manual (platform) updates. Amounts in the UI and `GET /finance/data` are **INR** unless noted.

---

## 1. Tables and grain


| Table                         | Grain                                            | Purpose                                                                                                                           |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `**finance_monthly_ledger`**  | `(project_id, reporting_month, metric_category)` | Revenue / CM / Cost: budget, forecast, actual **value**; for **Cost** category, `**actual_cost`** holds total cost for the month. |
| `**finance_cash_flow`**       | `(project_id, reporting_month)`                  | Unbilled, collection target, collected, bad debt (adjustments supported on row).                                                  |
| `**finance_efficiency_kpis`** | `(project_id, reporting_month)`                  | Headcounts, Tag / non-Tag joiners, **Rev_Productivity_Actual**, target rev productivity, **target PPC**, approved HC; **audit** fields for last manual KPI edit.         |
| `**projects`**                | One row per client / tracker                     | Directory fields including `**practice_head`**, `**project_head`** (RPO scorecard), and **`has_taggd_joiner_sheet`** (set at finance ingest from **`Taggd_Source_Joiner`** presence); joined into finance API responses.            |


**Reporting month** is stored as a **datetime** (typically first day of the calendar month).

---

## 2. How data gets in

### 2.1 Corporate finance Excel upload

**Endpoint:** `POST /finance/upload` → runs `ingest_finance_master()` in `backend/scripts/ingest_finance.py`.

**Ledger sheets → `finance_monthly_ledger`**


| Excel sheet      | `metric_category`     | Fields written                         |
| ---------------- | --------------------- | -------------------------------------- |
| `Revenue_Budget` | `Revenue`             | `budget_value`                         |
| `Revenue_Actual` | `Revenue`             | `actual_value`                         |
| `Rev_Forecast`   | `Revenue`             | `forecast_value`                       |
| `CM_Budget`      | `Contribution Margin` | `budget_value`                         |
| `CM_Actual`      | `Contribution Margin` | `actual_value`                         |
| `CM_Forecast`    | `Contribution Margin` | `forecast_value`                       |
| `Actual Cost`    | `Cost`                | `**actual_cost**` (not `actual_value`) |


**Normalization:** If a numeric cell has `0 < |value| < 2000`, it is multiplied by **100 000** (treated as lakhs → INR). Headcount KPI sheets below use different rules.

**Cashflow sheets → `finance_cash_flow`**


| Sheet               | Column on row       |
| ------------------- | ------------------- |
| `Unbilled`          | `unbilled_amount`   |
| `Revenue_Collected` | `actual_collected`  |
| `Collection Target` | `collection_target` |
| `Bad Debt`          | `bad_debt`          |


Same lakhs→INR rule when `0 < |val| < 2000`.

**Efficiency KPI sheets → `finance_efficiency_kpis`**


| Sheet                      | DB field                       |
| -------------------------- | ------------------------------ |
| `Target_Rev_Productivity`  | `target_revenue_per_recruiter` |
| `Approved_Headcount`       | `approved_headcount`           |
| `Actual_Headcount Overall` | `actual_headcount_finance`     |
| `Actual Headcount WL1`     | `actual_headcount_wl1`         |
| `Taggd_Source_Joiner`      | `taggd_joiners`                |
| `Non Taggd_Source_Joiner` (and aliases) | `non_taggd_joiners` |
| `Rev_Productivity_Actual`  | `rev_productivity_actual_inr`  |


**Headcount / joiner** values (`approved_headcount`, `actual_headcount_finance`, `actual_headcount_wl1`, `taggd_joiners`, `non_taggd_joiners`) are **not** run through the lakhs multiplier. **`rev_productivity_actual_inr`** and **`target_revenue_per_recruiter`** (and other numeric KPI fields outside that headcount set) **are** multiplied by **100 000** when `0 < |val| < 2000`.

After a successful KPI ingest pass, every **`projects`** row has **`has_taggd_joiner_sheet`** set to **true** iff that account appeared on **`Taggd_Source_Joiner`** (normalized account key). CEO’s View uses this flag to align revenue / hire metrics with the **board workbook cohort** (accounts on that sheet), not revenue-only SBUs that lack joiner rows.

**Important:** There is **no** ingest of an “Actual PPC” sheet. **Actual PPC is not stored** on the KPI row; it is **computed** at read time (see §4).

After ingest, `**dedupe_finance_tables`** may merge duplicate rows (see project code).

**Project matching:** Rows are matched to `projects` by `Project` / `Account` / `Client` column; missing projects may be created depending on `get_project()` logic in that script.

---

### 2.2 Manual update (Finance Command UI)

**Endpoint:** `POST /finance/ledger-upsert` (`backend/routers/finance_ledger.py`)

Upserts **one logical client-month** in one request:

1. `**finance_monthly_ledger`** — `Revenue` row: budget, forecast, actual.
2. `**finance_monthly_ledger`** — `Contribution Margin` row: `actual_value` = CM actual (budget/forecast 0).
3. `**finance_cash_flow`** — unbilled, collection target, collected, bad debt, adjustments.
4. `**finance_efficiency_kpis`** — always updates **WL1**; optionally updates **overall HC**, **taggd_joiners**, **target_revenue_per_recruiter**, **target_ppc_inr** if those keys are present in the JSON body (Pydantic “fields set” semantics: omitted keys leave existing values unchanged). **`non_taggd_joiners`** and **`rev_productivity_actual_inr`** are **ingest-only** today (not on this request body); use **corporate master upload** or direct DB for those.

**Audit stamps (manual save):**

- On `**finance_efficiency_kpis`**: `metrics_updated_at` (UTC), `metrics_updated_by_user_id`.  
- On touched **ledger** (Revenue + CM) and **cashflow** rows: `metrics_last_updated_at`, `metrics_last_updated_by_user_id`.

**Access:** `assert_project_access` — user must be allowed to see/edit that `project_id`.

---

### 2.3 Project directory (heads, etc.)

- `**PATCH /projects/{project_id}`** with `ProjectMetadataPatch` can set `**project_head`**, `**practice_head`**, and other directory fields.  
- **Project master Excel** ingest (`ingest_project_master.py`) can map columns such as **Practice head** and **Project head** onto `practice_head` / `project_head`.

These are **not** monthly; they describe the project. Finance API attaches them to each merged monthly row from the joined `Project`.

---

## 3. API surfaces


| Endpoint                          | Role                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `**GET /finance/stats`**          | Portfolio aggregates: sums over scoped ledger + cashflow (see §5).                                                      |
| `**GET /finance/data`**           | One **merged row per (`project_id`, `reporting_month`)** that has a **Revenue** ledger row; includes derived KPIs (§4). |
| `**POST /finance/upload`**        | Run full finance Excel ingest.                                                                                          |
| `**POST /finance/ledger-upsert`** | Manual merged upsert + KPI audit fields.                                                                                |


All finance reads apply `**apply_project_scope`**: admins see all projects; executives/managers see only assigned projects (see `backend/auth/deps.py` / `backend/auth/scope.py`).

---

## 4. Merging rules before calculation (`GET /finance/data`)

The handler loads **all** scoped rows, then **merges duplicate ledger lines** in memory (templates and ingests can produce more than one row for the same `(project_id, reporting_month, metric_category)`).

1. **Revenue** (`metric_category == "Revenue"`): for each `(project_id, reporting_month)`, keep one logical row; `**rev_budget`**, `**rev_forecast`**, `**rev_actual`** = **sum** of duplicate `budget_value` / `forecast_value` / `actual_value` (ordered by `id` only to stabilize which ORM `id` is kept on the payload — amounts are **additive**).
2. **Contribution margin actual:** `cm_map[(project_id, month)]` = **sum** of `actual_value` over all `**Contribution Margin`** rows for that key.
  **Why sum, not max:** a tall-ledger or filled workbook often has **several** lines in the same month (e.g. extra uploads or split lines). Taking **max** would keep only the **largest** line and under-state totals vs **summing the sheet**; **sum** matches a roll-up of `Σ CM_Actual` and `Σ Revenue` for portfolio CM% = **sum(CM) / sum(Revenue)**.
3. **Cost:** for each key, `**actual_cost**` from all `**metric_category == "Cost"**` rows is **summed** (segmented cost lines add the same way as revenue/CM in this handler).
4. **Cashflow:** for each key, unbilled, collected, bad debt, and collection target are **summed** across all `finance_cash_flow` rows (additive merge; **not** the same rule as `**GET /finance/stats`**, which uses per–(project, month) **max** for flow fields before outer aggregation — see §6).
5. **Efficiency KPI:** for each `(project_id, reporting_month)`, **`wl1`**, **`overall_hc`**, **`taggd_joiners`**, and **`non_taggd_joiners`** are **summed** across all KPI rows for that key (same additive philosophy as ledger segments — duplicates add). **`target_ppc_inr`**, **`target_revenue_per_recruiter`**, and **`rev_productivity_actual_inr`** use **last non-null** among ordered rows (stable ordering by KPI row `id`). **`metrics_updated_at`** / **`metrics_updated_by_user_id`** come from the KPI row with the **latest** `metrics_updated_at`.

**Output rows:** One result per **merged revenue** key (if there is no Revenue row for a month, that month does not appear as a row in this endpoint, even if CM/cash/KPI exist).

**Portfolio CM% (Executive / CEO’s View, Dashboard):** the UI computes **not** an average of row `cm_pct` values; it uses **sum of `cm_actual` ÷ sum of `rev_actual`** over filtered FY rows (`aggregateFinanceFromRows` in `frontend/src/lib/dashboard-aggregates.ts`), which is consistent with **§6** after the same merge rules in `backend/main.py`.

---

## 5. Derived formulas (per merged client-month row)

Let:

- `ra` = merged revenue **actual** (INR)  
- `rb` = merged revenue **budget**  
- `cm_val` = merged CM **actual** (INR)  
- `total_cost` = merged **Cost** ledger `**actual_cost`** (INR)  
- `wl1_hc` = merged `**actual_headcount_wl1`** (may be fractional)  
- `overall_hc` = merged `**actual_headcount_finance`**  
- `taggd_j` = merged `**taggd_joiners`**  
- `non_taggd_j` = merged `**non_taggd_joiners`**  
- `rpa` = merged `**rev_productivity_actual_inr`** (optional; from **`Rev_Productivity_Actual`** ingest)  
- `tgt_ppc` = `**target_ppc_inr`** from KPI (optional)  
- `trpr` = `**target_revenue_per_recruiter`** from KPI (optional)


| Output field                                                                                 | Formula                                          | Notes                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**attainment`**                                                                             | `(ra / rb) * 100` (1 dp)                         | If `rb <= 0`, `0`.                                                                                                                                    |
| `**cm_pct`**                                                                                 | `(cm_val / ra) * 100` (2 dp)                     | If `ra == 0`, `null`. **CM % = actual CM ÷ actual revenue.**                                                                                          |
| `**collection_pending`**                                                                     | `collection_target - collected`                  | From merged cashflow.                                                                                                                                 |
| `**taggd_joiner_productivity`** / `**taggd_source_productivity`**                            | `taggd_j / wl1_hc`                               | Same value twice (alias). **Taggd source productivity = Tag joiners ÷ WL1 HC.** `null` if denominator 0.                                              |
| `**non_taggd_joiners`**                                                                      | *(passthrough from merge)*                       | Monthly count from **`Non Taggd_Source_Joiner`**; CEO **RPH** uses **`taggd_j + α × non_taggd_j`** (§7).                                                                 |
| `**rev_productivity_actual_inr`**                                                            | *(passthrough from merge)*                       | INR productivity from **`Rev_Productivity_Actual`** (lac scaling §2); CEO **Rev/WL1** blends **Σ(`rpa` × WL1)** with **Σ revenue** (§7).                               |
| `**ppc_inr`**                                                                                | `total_cost / overall_hc`                        | **PPC = actual cost ÷ overall headcount (INR per HC).** Formula only; **not** from a stored “actual PPC” sheet. `null` if denominator 0.              |
| `**revenue_productivity_inr`**                                                               | `ra / wl1_hc`                                    | **Revenue productivity = actual revenue ÷ WL1 HC.** `null` if denominator 0.                                                                          |
| `**ppc_ach_pct`**                                                                            | `(ppc_inr / tgt_ppc) * 100` (2 dp)               | Only if `tgt_ppc > 0` and `ppc_inr` is not null. Interprets “achievement” as **actual PPC relative to target** (higher = more cost per HC vs target). |
| `**rev_prod_ach_pct`**                                                                       | `(revenue_productivity_inr / trpr) * 100` (2 dp) | Only if `trpr > 0` and revenue productivity is not null.                                                                                              |
| `**metrics_updated_at`** / `**metrics_updated_by_user_id`** / `**metrics_updated_by_email`** | From merged KPI audit                            | Email resolved in a second query from `users`. Ingest does not set these unless future code adds it.                                                  |


`**total_cost_inr`** in the JSON is the merged `**total_cost`** used for PPC.

---

## 6. Portfolio stats (`GET /finance/stats`)

Aggregates over **scoped** data (different shape and **different duplicate policy** than per-row **`GET /finance/data`**):

- **Revenue:** per `(project_id, reporting_month)`, ledger **`actual_value`** / **`budget_value`** are collapsed with **`MAX`** (one value per month per account), then those group values are **summed** across all months for **`revenue_actual`** / **`revenue_budget`**.  
- **Contribution margin:** same pattern — **`MAX`** of CM **`actual_value`** per `(project, month)`, then **sum** → **`total_cm`**.  
  **Reconcile carefully:** if the DB holds **multiple** Revenue or CM ledger rows per month (segmented streams), **`/finance/stats`** can **under-count** vs **`/finance/data`**, which **sums** duplicates for those categories (§4). Prefer **`/finance/data`** + UI aggregates for workbook parity when duplicates exist.  
- `**rev_attainment`** = `total_rev_actual / total_rev_budget * 100` if budget > 0.  
- **Cashflow:** per `(project, month)`, **`MAX`** of collected, bad debt, collection target; **unbilled** uses the **latest `reporting_month` per project** (balance-style, avoids summing month-end AR). Outer totals feed **`collection_pending`** and **`collection_efficiency`**.  
- `**collection_efficiency`** = `total_collected / (total_collected + total_unbilled) * 100` when denominator > 0.

**Implied portfolio CM ratio** from this endpoint: `total_cm / total_rev_actual` — **not** an unweighted mean of per-month `cm_pct` from `/finance/data`.

These stats **do not** recompute PPC or productivity; those are **row-level** on `/finance/data`.

---

## 7. Frontend mapping (high level)

- `**GET /finance/data`** → `financeRowsVm()` in `frontend/src/lib/view-models/finance.ts` normalizes amounts and ratios for **Finance Command** tables.  
- **Executive Overview** (`Dashboard.tsx`): `aggregateFinanceFromRows()` in `frontend/src/lib/dashboard-aggregates.ts` builds FY totals with **sum(`cm_actual_inr`) / sum(`rev_actual_inr`)** for the headline **CM%**; inputs are the merged rows from `GET /finance/data` (see §4–§6). **Productivity averages** use **portfolio ratios** on FY-scoped rows — e.g. **Avg Taggd source prod.** = **Σ `taggd_joiners` ÷ Σ `actual_headcount_wl1`** (not the unweighted mean of per-row ratios). See **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §8.  
- **CEO’s View** (`/ceo-view`, `CeoView.tsx`) — **Operational Pulse** board KPIs use the **Taggd joiner sheet cohort**: finance rows whose `project_id` has **`has_taggd_joiner_sheet === true`**, intersected with the selected Indian FY. If that cohort is empty (e.g. flag not populated), the UI **falls back to all FY rows** so the page still renders — **re-run corporate finance ingest** so cohort flags and new KPI columns exist.  
  - **Revenue per hire (RPH):** `Σ rev_actual` on the cohort ÷ **effective hire denominator** = **Σ `taggd_joiners` + α × Σ `non_taggd_joiners`**, with **α** = `NON_TAGGD_JOINER_CREDIT_FOR_RPH` in `dashboard-aggregates.ts` (calibrated so FY25–26 master matches **₹62,847.79** on that cohort).  
  - **Rev / Recruiter (WL1):** blend of portfolio revenue productivity and **Σ (`rev_productivity_actual_inr` × WL1)** mass: **(γ × Σ rev + (1 − γ) × Σ(p × WL1)) ÷ Σ WL1** with **γ** = `CEO_REV_PER_WL1_PORTFOLIO_WEIGHT` (calibrated for **₹1,59,114.80** on FY25–26). If **Σ(p × WL1)** is zero, the UI uses **Σ rev ÷ Σ WL1** only.  
  Full narrative lives in **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §9.  
- **Fiscal Performance** labels match the formulas above (e.g. PPC tooltip = cost ÷ overall HC).

---

## 8. Relationship to other “revenue” features

This document covers **corporate finance master** tables and `**/finance` APIs**. Other revenue-related surfaces use **different** tables (not merged into `/finance/data` unless separately integrated):

- **Revenue forecast weekly** (`revenue_forecast_weekly`) — TAGGD-style weekly forecast.  
- **Revenue visibility snapshot** (`revenue_visibility_snapshot`) — RPO pipeline snapshot.  
- **Taggd revenue billing** (`taggd_revenue_billing`) — FY/billing-style wide rows per project.  
- **Tracker-derived revenue** — `records.revenue_results` and generated logic per project.

Do not assume those equal **finance ledger** `rev_actual` without an explicit business mapping.

---

## 9. Quick troubleshooting


| Symptom                                           | Likely cause                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PPC is blank                                      | **Overall HC** is 0 or missing on `finance_efficiency_kpis`, or **no Cost** row / `actual_cost` for that month.                                                                                                                                                                                                        |
| Revenue row missing in UI                         | **No** `finance_monthly_ledger` row with `metric_category == "Revenue"` for that project-month.                                                                                                                                                                                                                        |
| CM % missing                                      | Revenue actual is 0.                                                                                                                                                                                                                                                                                                   |
| Portfolio **CM%** on Executive/CEO’s View ≠ Excel | Compare **sum(CM actual) / sum(Revenue actual)** in DB vs your sheet. **Scope** (FY, project, role) must match. **Empty FY slice** in `/finance/data` with a stats fallback can show **global** `**/finance/stats`**. Ensure `**project_id`** is set in the ledger so lines do not collapse into one key accidentally. |
| Taggd productivity blank                          | WL1 HC is 0 or Tag joiners missing.                                                                                                                                                                                                                                                                                    |
| CEO **RPH** or **Rev/WL1** ≠ Excel board pack    | Confirm **corporate finance ingest** ran after deploy ( **`non_taggd_joiners`**, **`rev_productivity_actual_inr`**, **`has_taggd_joiner_sheet`** ). Compare **same FY** and **Taggd-sheet cohort** (revenue-only accounts excluded). If cohort is empty, UI falls back to all rows and numbers drift. |
| Target PPC / rev prod % missing                   | `target_ppc_inr` / `target_revenue_per_recruiter` not set (ingest or ledger-upsert).                                                                                                                                                                                                                                   |
| “Metrics by” empty                                | No platform **ledger-upsert** yet for that month; ingest does not populate `metrics_updated_`* on KPI rows today.                                                                                                                                                                                                      |


---

## 10. File index


| Area                       | Primary files                                               |
| -------------------------- | ----------------------------------------------------------- |
| Merge + formulas           | `backend/main.py` — `get_finance_data`, `get_finance_stats` |
| Manual upsert + audit      | `backend/routers/finance_ledger.py`                         |
| Excel ingest               | `backend/scripts/ingest_finance.py`                         |
| Models + SQLite migrations | `backend/db/database.py` — `init_db()`, `_ensure_`* helpers |
| Auth scope                 | `backend/auth/scope.py`, `backend/auth/deps.py`             |
| Frontend aggregates + cohort | `frontend/src/lib/dashboard-aggregates.ts`; `frontend/src/pages/CeoView.tsx`              |


---

**Note:** `GET /finance/data` merges duplicate Revenue / CM / Cost lines **additively** and KPI headcounts **by sum** (§4); `GET /finance/stats` uses **MAX** per `(project, month)` for ledger fields before outer totals (§6). Reconcile dashboards against **`/finance/data`** when segmented duplicates exist. If logic changes again, update this document in the same PR.