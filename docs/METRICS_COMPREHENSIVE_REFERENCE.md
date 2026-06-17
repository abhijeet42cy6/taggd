# Taggd RevOps — Comprehensive Metrics Reference

**Version:** 2026-06-16  
**Scope:** Every KPI/metric displayed in the revagent platform, with formulas at **client (unit) level** and **portfolio (overall) level**, and how each value is derived from PostgreSQL.

**Companion docs:** `FINANCE_METRICS_AND_UPDATES_REFERENCE.md`, `DATABASE_SCHEMA.md`, `docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`

---

## Table of contents

1. [Conventions](#1-conventions)
2. [Database tables used for metrics](#2-database-tables-used-for-metrics)
3. [Aggregation levels and merge policies](#3-aggregation-levels-and-merge-policies)
4. [Corporate Finance metrics](#4-corporate-finance-metrics)
5. [Executive Overview & CEO's View](#5-executive-overview--ceos-view)
6. [SLA / KPI Performance](#6-sla--kpi-performance)
7. [Workforce Management (WFM)](#7-workforce-management-wfm)
8. [Client Pipeline & RPO metrics](#8-client-pipeline--rpo-metrics)
9. [Requisitions & Operations](#9-requisitions--operations)
10. [Offer & Onboarding](#10-offer--onboarding)
11. [Revenue Governance (Trackers, Billing, Budget/Forecast)](#11-revenue-governance)
12. [Revenue Leakage](#12-revenue-leakage)
13. [Tracker-derived revenue (per-project logic)](#13-tracker-derived-revenue)
14. [Portfolio Intelligence composite scores](#14-portfolio-intelligence-composite-scores)
15. [Executive Risk Radar](#15-executive-risk-radar)
16. [Data Operations integrity metrics](#16-data-operations-integrity-metrics)
17. [Projections (forward model)](#17-projections-forward-model)
18. [Other operational pages](#18-other-operational-pages)
19. [API endpoint index](#19-api-endpoint-index)
20. [File index](#20-file-index)

---

## 1. Conventions

### 1.1 Fiscal year

- **Indian FY:** April → March. Label `FY2025` = FY2025-26 (Apr 2025 – Mar 2026).
- FY start year from a calendar date: if month ≥ April (UTC), FY start = calendar year; else FY start = calendar year − 1.
- Month index in FY: Apr=0 … Mar=11.

### 1.2 Units

| Context | Unit |
|---------|------|
| Finance ledger amounts | **INR** (integer/float in DB; UI often shows **₹ Cr** = ÷ 10⁷) |
| WFM lateral revenue in workbook | Often **lacs**; values &lt; ₹5L in UI may be × 10⁵ |
| SLA scores | String (days, %, ratio) — not typed |
| Headcount / joiner counts | Integer or float (WL1 may be fractional) |
| Percentages | 0–100 unless noted as ratio 0–1 |

### 1.3 Lakhs normalization (finance ingest)

When ingesting corporate finance Excel, if `0 < |value| < 2000`, multiply by **100,000** (treat as lakhs → INR).

**Excluded from lakhs scaling:** `approved_headcount`, `actual_headcount_finance`, `actual_headcount_wl1`, `taggd_joiners`, `non_taggd_joiners`.

### 1.4 Aggregation level labels

| Label | Meaning |
|-------|---------|
| **L0** | Single record (req, candidate, SLA performance row) |
| **L1** | Client × period (project × month/week/date) |
| **L2** | Client rollup (one project or account, all periods in filter) |
| **L3** | Portfolio (all scoped clients/projects) |

### 1.5 Access scope

All reads apply **project scope** (role-based). Admins see all projects; executives/managers see assigned projects only. Metrics below assume scoped data unless noted.

---

## 2. Database tables used for metrics

### 2.1 Finance

| Table | Grain | Key columns |
|-------|-------|-------------|
| `finance_monthly_ledger` | `(project_id, reporting_month, metric_category)` | `budget_value`, `forecast_value`, `actual_value`, `actual_cost` |
| `finance_cash_flow` | `(project_id, reporting_month)` | `unbilled_amount`, `collection_target`, `actual_collected`, `bad_debt`, `adjustments` |
| `finance_efficiency_kpis` | `(project_id, reporting_month)` | `target_revenue_per_recruiter`, `approved_headcount`, `actual_headcount_finance`, `actual_headcount_wl1`, `taggd_joiners`, `non_taggd_joiners`, `rev_productivity_actual_inr`, `target_ppc_inr` |
| `projects` | One row per engagement | `has_taggd_joiner_sheet`, `practice_head`, `project_head`, hierarchy tags |

**Ledger `metric_category` values:** `Revenue`, `Contribution Margin`, `Cost`, plus planning categories: `Revenue_MMF`, `Revenue_JoiningFee`, `Revenue_OpeningFee`, `Revenue_ToBeOfferFee`, `Forecast_Joiners`, `Revenue_PlanningOther`.

### 2.2 SLA

| Table | Grain | Key columns |
|-------|-------|-------------|
| `metric_definitions` | `(project_id, metric_label)` | `metric_group`, `metric_nature`, `target_threshold`, `definition`, `calculation_method`, `formula`, `source_system` |
| `sla_performances` | `(definition_id, reporting_month)` | `score`, `rag_status`, `period_start` |

### 2.3 WFM

| Table | Grain | Key columns |
|-------|-------|-------------|
| `wfm_hr_benchmarks` | `(project_id, reporting_date)` | `ideal_hc`, `actual_hc_total`, `lateral_*_target`, `wl1_hires`…`wl4_hires`, `sheet_metrics_json` |
| `wfm_resource_gaps` | One row per open req line | `req_id`, `status`, `hiring_type`, `designation_level`, `target_date` |

### 2.4 Operations & revenue

| Table | Grain | Key columns |
|-------|-------|-------------|
| `records` | One requisition/candidate row | `global_status`, `status`, dates, funnel counters, `revenue_results` JSON, RPO fields |
| `candidates` | Offer/onboarding rows | `offer_*`, `joining_status`, `expected_doj`, `actual_doj`, check-in fields |
| `revenue_forecast_weekly` | `(project_id, week_start_date)` | Fee components, counts, `achievement_pct` |
| `revenue_visibility_snapshot` | `(project_id, as_of_date)` | Pipeline fees, `conversion_rate_pct`, `revenue_realised_pct` |
| `taggd_revenue_billing` | One FY-style row per project | Revenue, joiners, `rph_inr`, `pct_of_target`, invoice lifecycle |
| `revenue_weekly_submission` | Workflow envelope | Status, submit/approve timestamps |

---

## 3. Aggregation levels and merge policies

### 3.1 Finance duplicate handling

| Endpoint / path | Revenue / CM / Cost duplicates per (project, month) | Unbilled |
|-----------------|-----------------------------------------------------|----------|
| `GET /finance/data` | **SUM** | **SUM** all months in slice (with ≥10⁹ downscale ÷10⁵) |
| `GET /finance/stats` | **MAX** per (project, month), then SUM | **Latest month per project** (balance-style) |
| Client dashboard `_finance_snapshot` | **MAX** per (project, month), then SUM | Latest month per project |
| Executive `aggregateFinanceFromRows()` | Uses `/finance/data` rows (SUM merge) | `sumUnbilledAllMonths()` |

**Implication:** Portfolio totals can differ between Finance Command (`/finance/stats`) and Executive Overview (`/finance/data` + frontend) when duplicate ledger rows exist.

### 3.2 SLA Met %

Always: `met / (met + not_met) × 100` — **excludes** `not_reported`.

RAG bucketing: `backend/core/sla_period.py` → `bucket_sla_rag()`.

### 3.3 Portfolio CM %

Always: `Σ CM_actual / Σ Revenue_actual × 100` — **never** unweighted mean of row CM%.

---

## 4. Corporate Finance metrics

**Primary API:** `GET /finance/data` (L1 rows), `GET /finance/stats` (L3)  
**Ingest:** `POST /finance/upload` → `backend/scripts/ingest_finance.py`  
**Manual edit:** `POST /finance/ledger-upsert`  
**Code:** `backend/main.py` (`get_finance_data`, `get_finance_stats`), `frontend/src/lib/view-models/finance.ts`, `frontend/src/lib/dashboard-aggregates.ts`

### 4.1 Stored raw metrics (L1 — database)

Each row is one `(project_id, reporting_month)` after merge.

| UI name | DB source | Ingest sheet |
|---------|-----------|--------------|
| Revenue Budget | `finance_monthly_ledger.budget_value` WHERE `metric_category='Revenue'` | `Revenue_Budget` |
| Revenue Forecast | `finance_monthly_ledger.forecast_value` WHERE `metric_category='Revenue'` | `Rev_Forecast` |
| Revenue Actual | `finance_monthly_ledger.actual_value` WHERE `metric_category='Revenue'` | `Revenue_Actual` |
| CM Budget / Forecast / Actual | Same table, `metric_category='Contribution Margin'` | `CM_Budget`, `CM_Forecast`, `CM_Actual` |
| Total Cost | `finance_monthly_ledger.actual_cost` WHERE `metric_category='Cost'` | `Actual Cost` |
| Unbilled | `finance_cash_flow.unbilled_amount` | `Unbilled` |
| Collection Target | `finance_cash_flow.collection_target` | `Collection Target` |
| Collected | `finance_cash_flow.actual_collected` | `Revenue_Collected` |
| Bad Debt | `finance_cash_flow.bad_debt` | `Bad Debt` |
| Target Rev Productivity | `finance_efficiency_kpis.target_revenue_per_recruiter` | `Target_Rev_Productivity` |
| Approved HC | `finance_efficiency_kpis.approved_headcount` | `Approved_Headcount` |
| Overall Actual HC | `finance_efficiency_kpis.actual_headcount_finance` | `Actual_Headcount Overall` |
| WL1 Actual HC | `finance_efficiency_kpis.actual_headcount_wl1` | `Actual Headcount WL1` |
| Taggd Joiners | `finance_efficiency_kpis.taggd_joiners` | `Taggd_Source_Joiner` |
| Non-Taggd Joiners | `finance_efficiency_kpis.non_taggd_joiners` | `Non Taggd_Source_Joiner` |
| Rev Productivity Actual | `finance_efficiency_kpis.rev_productivity_actual_inr` | `Rev_Productivity_Actual` |
| Target PPC | `finance_efficiency_kpis.target_ppc_inr` | Manual upsert only |

**DB join for `/finance/data`:** LEFT JOIN ledger (Revenue, CM, Cost), cashflow, efficiency KPIs, and `projects` on `project_id` + `reporting_month`.

### 4.2 Derived metrics — L1 (client-month)

Computed in `get_finance_data()` after in-memory merge:

| Metric | Formula | Code variable |
|--------|---------|---------------|
| **Attainment %** | `(ra / rb) × 100` | `attainment`; `rb≤0` → 0 |
| **CM %** | `(cm_val / ra) × 100` | `cm_pct`; `ra=0` → null |
| **Collection Pending** | `collection_target − collected` | `collection_pending` |
| **Taggd Source Productivity** | `taggd_joiners / wl1_hc` | `taggd_joiner_productivity` |
| **PPC (INR/HC)** | `total_cost / overall_hc` | `ppc_inr` |
| **Revenue Productivity (INR/WL1)** | `ra / wl1_hc` | `revenue_productivity_inr` |
| **PPC Achievement %** | `(ppc_inr / target_ppc) × 100` | `ppc_ach_pct` |
| **Rev Prod Achievement %** | `(revenue_productivity_inr / target_revenue_per_recruiter) × 100` | `rev_prod_ach_pct` |

Where:
- `ra` = merged revenue actual (INR)
- `rb` = merged revenue budget
- `cm_val` = sum of CM `actual_value`
- `total_cost` = sum of Cost `actual_cost`
- `wl1_hc` = sum of `actual_headcount_wl1`
- `overall_hc` = sum of `actual_headcount_finance`

**KPI duplicate merge within month:** WL1, overall HC, taggd/non-taggd joiners → **SUM**; targets and `rev_productivity_actual_inr` → **last non-null** by row id.

### 4.3 Portfolio metrics — L3

#### From `GET /finance/stats` (SQL)

```sql
-- Revenue actual (portfolio)
SELECT SUM(ma) FROM (
  SELECT MAX(actual_value) AS ma
  FROM finance_monthly_ledger
  WHERE metric_category = 'Revenue'
  GROUP BY project_id, reporting_month
) sub;

-- Same pattern for budget, CM actual
-- Cashflow: MAX per (project, month) for collected, target, bad_debt
-- Unbilled: latest reporting_month per project_id, then SUM those values
```

| Metric | L3 formula |
|--------|------------|
| **Revenue Actual** | `SUM(MAX(actual_value))` per (project, month) |
| **Revenue Budget** | `SUM(MAX(budget_value))` per (project, month) |
| **Rev Attainment %** | `revenue_actual / revenue_budget × 100` |
| **Total CM** | `SUM(MAX(cm actual_value))` per (project, month) |
| **Portfolio CM %** | `total_cm / revenue_actual × 100` |
| **Total Collected** | `SUM(MAX(actual_collected))` per (project, month) |
| **Total Collection Target** | `SUM(MAX(collection_target))` per (project, month) |
| **Collection Pending** | `total_collection_target − total_collected` |
| **Total Unbilled** | Sum of latest-month unbilled per project |
| **Collection Efficiency %** | `total_collected / (total_collected + total_unbilled) × 100` |

#### From frontend `aggregateFinanceFromRows()` (Executive / filtered FY)

Used when FY/region/account filters applied on `/finance/data` rows:

| Metric | L3 formula |
|--------|------------|
| **Revenue Budget / Forecast / Actual** | `Σ row.rev_*_inr` |
| **Total CM** | `Σ row.cm_actual_inr` |
| **Portfolio CM %** | `Σ cm / Σ rev × 100` |
| **Rev Attainment** | `Σ rev_actual / Σ rev_budget × 100` |
| **Unbilled** | `sumUnbilledAllMonths(rows)` — sum all months; values ≥10⁹ INR ÷10⁵ |
| **Collection Efficiency** | `Σ collected / (Σ collected + Σ unbilled) × 100` |

### 4.4 Productivity metrics — L2/L3 (Finance Command & Executive)

| UI name | Level | Formula |
|---------|-------|---------|
| **Avg Taggd Source Prod.** | L3 (filtered rows) | `Σ taggd_joiners / Σ actual_headcount_wl1` |
| **Avg PPC** | L3 | `Σ(rev_actual − cm_actual) / Σ actual_headcount_overall` |
| **Avg Rev / WL1** | L3 | Arithmetic **mean** of per-row `revenue_productivity_inr` (or `rev_productivity_actual_inr`) |
| **PPC (row)** | L1 | `total_cost_inr / actual_headcount_overall` OR implied `Σ(rev−cm)/Σ HC` at account level |

**Account scorecard (L2 per account):** Group `/finance/data` rows by `account_name`; CM% = `Σ cm / Σ rev`; joiner prod and PPC use portfolio ratios above on account subset.

### 4.5 Client-level finance snapshot

**API:** `GET /client-dashboard/summary` → `_finance_snapshot()`  
**Scope:** All `project_ids` linked to client.

Uses **MAX** merge (same as `/finance/stats`), not SUM. Returns: `revenue_actual`, `revenue_budget`, `rev_attainment`, `total_cm`, `total_unbilled`, `total_collected`, `total_bad_debt`, `collection_pending`, `collection_efficiency`.

Visibility controlled by `client_dashboard_configs.config_json` flags (`finance_show_*`).

---

## 5. Executive Overview & CEO's View

**Routes:** `/` (Dashboard), `/ceo-view` (CeoView)  
**APIs:** `/finance/data`, `/finance/stats`, `/sla/stats`, `/wfm/stats`, `/stats/requisitions/kpis`, `/stats/global/monitor`

### 5.1 Financial hero cards (L3, FY-filtered)

| Display | Formula | Source |
|---------|---------|--------|
| Revenue Actual | `Σ rev_actual_inr` | `aggregateFinanceFromRows(kpiRows)` |
| Rev Attainment | `rev_attainment` from aggregate | actual ÷ budget × 100 |
| CM % | `total_cm / revenue_actual × 100` | Target ref **35%** |
| Collection | `Σ collected_inr` | vs `Σ collection_target_inr` |
| Full-year Forecast | `Σ rev_forecast_inr` | |
| Prior FY Actual | Prior FY slice of rows | |
| Unbilled (% of rev) | `sumUnbilledAllMonths / rev × 100` | |
| Bad Debt | `Σ bad_debt_inr` | % of collected |

### 5.2 Operational pulse (L3)

| Display | Formula | API |
|---------|---------|-----|
| SLA Portfolio Health | `portfolio_health` | `/sla/stats` → `met/(met+not_met)×100` |
| Workforce HC | `total_actual_hc`; sub: ideal + fill % | `/wfm/stats` |
| Pipeline Open Reqs | `open_req` | `/stats/requisitions/kpis` |
| Unbilled + Bad Debt | `unb + bd` | Finance aggregate |

### 5.3 CEO-specific metrics (Taggd joiner sheet cohort)

**Cohort filter:** `projects.has_taggd_joiner_sheet = true`. Fallback: all FY rows if cohort empty.

| Display | L3 formula | Constants |
|---------|------------|-----------|
| **Revenue per Hire (RPH)** | `Σ rev_actual / effective_hire_denominator` | |
| **Effective Hire Denominator** | `Σ taggd_joiners + α × Σ non_taggd_joiners` | α = `0.5841321872331346` |
| **Rev / Recruiter (WL1)** | `(γ × Σ rev + (1−γ) × Σ(rpa × WL1)) / Σ WL1` | γ = `0.11331722182836983`; fallback: `Σ rev / Σ WL1` |
| **Working Capital Risk** | `unbilled + bad_debt`; sub: % of revenue | |
| **WFM Fill Rate** | `capacity_fill_rate` | `/wfm/stats` |
| **PPC (CEO efficiency)** | `Σ total_cost_inr / Σ actual_headcount_overall` | |

### 5.4 Executive summary table (L3)

From `buildExecutiveSummary()`:

| Row | Budget | Actual | Var vs Budget | YoY |
|-----|--------|--------|---------------|-----|
| Revenue | `Σ rev_budget / 10⁷ Cr` | `Σ rev_actual` | `(actual/budget − 1) × 100` | vs prior FY |
| CM % | 35% ref | `cm/rev × 100` | actual − 35 pp | pp delta vs prior |
| Collection | `Σ target` | `Σ collected` | `(coll/target − 1) × 100` | YoY % |
| Unbilled | — | `Σ unbilled` | `unb/rev × 100` of Rev | YoY % |
| Bad Debt | — | `Σ bad_debt` | `bd/coll × 100` of Coll. | YoY % |

### 5.5 YoY charts (L3, by FY month)

| Chart | Formula per month |
|-------|-------------------|
| Revenue Actual/Budget/Forecast | Sum by `(fyStart, monthIndexInFY)` |
| Prior FY Actual overlay | Same bucket, compare FY |
| CM % YoY | `(Σ cm / Σ rev) × 100` per month; budget ref 35% |
| Regional Revenue | Group by `sub_region` or `region`; sum actual & budget |

### 5.6 Quarterly rollups (L3, Indian FY)

| Metric | Q1–Q4 formula |
|--------|---------------|
| Plan vs Actual Revenue | Sum `rev_budget_inr` / `rev_actual_inr` by quarter index |
| Collection Plan vs Actual | Sum `collection_target_inr` / `collected_inr` by quarter |
| CM Plan vs Actual | Plan = `0.35 × Σ rev_budget`; Actual = `Σ cm_actual` |

---

## 6. SLA / KPI Performance

**Route:** `/sla-performance`  
**APIs:** `/sla/stats`, `/sla/data`, `/sla/timeseries`, `/sla/account-metrics-timeseries`  
**Tables:** `metric_definitions`, `sla_performances`

### 6.1 Important: SLA scores are NOT computed at runtime

- **Definition** lives in `metric_definitions` (label, group, nature, target, formula text).
- **Observed value** is ingested into `sla_performances.score` (string).
- **RAG** is ingested into `sla_performances.rag_status`.
- The `formula` column is **documentation only** (from Excel / UI form).

### 6.2 SLA catalog (dev DB: ~175 unique labels)

**Standard groups:** Time to Hire, Time to Fill, Ageing, Hit Ratio, First Time Right Ratio, Offer Drop, Fulfilment, Diversity, CSAT/HM SAT, Source Mix, plus client-specific variants.

**Standard natures:** Contractual Penalty, Contractual Non-Penalty, Internal KPI, Speed, Quality, Efficiency, Experience, Fulfilment, D&I.

### 6.3 Standard SLA business formulas (from catalog — evaluated externally)

| KPI | Typical formula (stored in DB) | Target type |
|-----|-------------------------------|-------------|
| Time to Fill | `Offer Acceptance Date − Requisition Assignment Date` (days) | Days threshold |
| Time to Hire | `Joining Date − Requisition Assignment Date` (days) | Days threshold |
| Ageing % | `Positions open beyond TTF target / Total open positions` | % max |
| Hit Ratio | `Final selects by HM / Total CVs shared` | Ratio |
| First Time Right | `Screening shortlisted / Total CVs shared` | Ratio |
| Offer Drop | `(Declined + Revoked) / Total offers released` | % max |
| Fulfilment | `Joiners / Total open requisitions` | % min |
| Diversity | `Women joiners / Total joiners` | % min |
| Source Mix | `Non-paid channel joiners / Total joiners` | % min |

### 6.4 Platform-computed SLA metrics

#### L0 — single performance row

| Field | Source |
|-------|--------|
| Score | `sla_performances.score` |
| RAG | `sla_performances.rag_status` |
| Bucket | `bucket_sla_rag(rag)` → met / not_met / not_reported |

#### L1 — metric × month (account)

| Metric | Formula |
|--------|---------|
| **Met %** | `met_count / (met_count + not_met_count) × 100` |

From `/sla/timeseries`: group performances by `(account, reporting_month)`, count buckets, compute Met%.

#### L2 — account (latest decisive rows)

| Metric | Formula |
|--------|---------|
| **Account Met %** | Latest `sla_performances` per `definition_id` (max `period_start`), then Met% |
| **Account Health Tier** | RED &lt;50%, AMBER 50–74%, GREEN ≥75% Met% |

#### L3 — portfolio (`GET /sla/stats`)

| Display | DB derivation |
|---------|---------------|
| **Total Metrics** | `COUNT(metric_definitions.id)` scoped |
| **Total Accounts** | `COUNT(projects)` with account_name |
| **Portfolio Health %** | All `sla_performances.rag_status` → bucket → `met/(met+not_met)×100` |
| **Met Count** | Count performances where bucket = met |
| **Not Met Count** | Count performances where bucket = not_met |
| **Systemic Risks** | Top 5 `metric_label` by not_met performance count |

#### SLA page KPI strip (scoped filters)

| Display | Formula |
|---------|---------|
| Metrics Met % | Met ÷ (Met + Not met) on filtered rows |
| Metrics Not Met % | Not met ÷ (Met + Not met) |
| Not Reported | Count where bucket = not_reported |
| Metrics in Scope | Row count; sub: account count |

#### Bifurcation slices (filter by `metric_nature`)

| Slice | Filter |
|-------|--------|
| Contractual SLA | Contractual Penalty + Contractual Non-Penalty |
| Internal KPI | Internal KPI |
| Penalties triggered | Contractual Penalty |
| Non-penalty | Contractual Non-Penalty |

Each slice: same Met / Not met / Met % formulas on subset.

---

## 7. Workforce Management (WFM)

**Route:** `/wfm`  
**APIs:** `GET /wfm/stats`, `GET /wfm/data`  
**Tables:** `wfm_hr_benchmarks`, `wfm_resource_gaps`

**Snapshot rule:** Latest `reporting_date` per `project_id` (`wfmDedupeLatestByProject`).

### 7.1 Stored metrics — L1 (client × reporting_date)

| Field | Column / JSON |
|-------|---------------|
| Ideal HC | `ideal_hc` |
| Actual HC Total | `actual_hc_total` |
| Lateral Revenue Target | `lateral_revenue_target` |
| Lateral HC Target | `lateral_hc_target` |
| Lateral Productivity Target | `lateral_productivity_target` |
| WL1–WL4 Hires | `wl1_hires` … `wl4_hires` |
| Ideal HC by WL | `sheet_metrics_json.ideal_hc_by_wl` |
| Open Positions | `sheet_metrics_json.open_positions` |
| Resignations (existing) | `sheet_metrics_json.resignations.existing` |
| Additional HC (manual) | `sheet_metrics_json.additional_hc` |
| Open Requisition count | `COUNT(wfm_resource_gaps)` per project |

### 7.2 Derived metrics — L1

| Metric | Formula |
|--------|---------|
| **Fill %** | `actual_hc_total / ideal_hc × 100` |
| **HC Gap** | `ideal_hc − actual_hc_total` |
| **Additional HC Proxy** | `max(0, lateral_hc_target − actual)` OR manual `additional_hc` |
| **Open Positions (sheet)** | `sheet_metrics_json.open_positions.total` |
| **Projected HC** | `actual + additional_hc + open_positions − resignations` |
| **Net Variance vs Projected** | `ideal − projected_hc` |
| **Net Variance Actual vs Projected** | `actual − projected_hc` |
| **Fill Band** | Strong 70–100%; Watch 50–69%; Risk: &gt;100% or &lt;50% |

### 7.3 Portfolio metrics — L3 (`GET /wfm/stats`)

| Display | Formula |
|---------|---------|
| **Capacity Fill Rate %** | `Σ actual_hc_total / Σ ideal_hc × 100` |
| **Total Actual HC** | `Σ actual_hc_total` |
| **Total Ideal HC** | `Σ ideal_hc` |
| **HC Gap** | `Σ ideal − Σ actual` |
| **WL Distribution** | Sum of `wl1_hires` … `wl4_hires` |
| **Open Requisitions** | `COUNT(wfm_resource_gaps)` scoped |
| **Total Resignations** | Sum of `sheet_metrics_json.resignations.existing` |

### 7.4 WFM page hero rollups (L3, frontend)

| Display | Formula |
|---------|---------|
| Forecast Revenue (Current Quarter) | `Σ lateral_revenue_target` (lacs heuristic if &lt;₹5L) |
| Target Productivity | `Σ(prod × ideal) / Σ ideal` weighted mean |
| Projected HC (portfolio) | `Σ wfmRowProjectedHc(row)` |
| Staff Gap % vs Actual | `(Σ ideal − Σ actual) / Σ ideal × 100` |
| Staff Gap % vs Projected | `(Σ ideal − Σ projected) / Σ ideal × 100` |
| Client Posture counts | Overstaffed / Understaffed / On track by projected vs ideal rules |

### 7.5 Summary table aggregations — L2/L3

Functions: `wfmAggregateByRegionalHead`, `wfmAggregateByPracticeHead`, `wfmAggregateByWlBand` — sum ideal/actual/open/resignations/projected; weighted productivity; fill % = `wfmFillPct(Σ actual, Σ ideal)`.

---

## 8. Client Pipeline & RPO metrics

**Code:** `backend/core/client_pipeline_metrics.py`  
**API:** `GET /client-dashboard/summary`  
**Source table:** `records` (+ filters on RPO dimensions)

### 8.1 Status classification (L0 rules)

| Status | Rule |
|--------|------|
| WIP | `global_status ∈ {ACTIVE, PIPELINE, ON HOLD, UNPROCESSED}` |
| Open | ACTIVE and status does not contain "offer" |
| Offered | Offer signal (status/offer date/offered CTC) and not CLOSED |
| YTJ | "yet to join" in candidate/status OR `joining_date > today` |
| Joiner | CLOSED OR `joining_date ≤ today` |
| Offer Drop | "offer drop" markers in candidate name or status |
| Cancelled | CANCELLED global status OR cancel date OR "cancel" in status |
| Hold | ON HOLD global status OR "hold" in status |

### 8.2 Snapshot counts — L2 (client, point-in-time)

| Metric | Formula |
|--------|---------|
| wip, open, offered, ytj, joiners, offer_drops, cancelled, hold | Counts per rules above |
| **total_demand** | `open + cancelled + hold` |

### 8.3 Time metrics — L2

| Metric | Formula |
|--------|---------|
| **avg_ageing_days** | Mean of `(today − creation_date)` for non-closed WIP/open |
| **median_ageing_days** | Median of same |
| **avg_tto_days** | Mean of `(req_offered_date − creation_date)` where both set |
| **median_tto_days** | Median of same |
| **avg_ttf_days** | Mean of `(joining_date − creation_date)` for joiners |
| **median_ttf_days** | Median of same |

### 8.4 Ratio metrics — L2

| Metric | Formula |
|--------|---------|
| **diversity_pct** | `female_joiners / total_joiners × 100` (from `additional_attributes.diversity`) |
| **rpo_mix_pct** | `taggd_rpo joiners / total_joiners × 100` |
| **offer_drop_pct** | `offer_drops / offered_count × 100` |
| **oar_pct** (Offer Acceptance Rate) | `joiners / offered × 100` |
| **jcr_pct** (Joiner Conversion Rate) | `joiners / accepted_offers × 100` |

### 8.5 Period activity metrics — L2 (date range)

Same counts filtered by events in `[period_start, period_end]`:
- Opens: `creation_date` in range
- Offers: `req_offered_date` in range
- Joiners: `joining_date` in range
- Cancelled: cancel date in range

**MoM/QoQ deltas:** `(current − prior) / prior × 100` for counts; absolute delta for ratio metrics.

### 8.6 Monthly series — L2/L3

Per calendar month (last 12 months):
`opens_created`, `open_wip`, `cancelled`, `hold`, `offered`, `joiners`, `offer_drops`, `ytj_end`, `aged_over_30`, `avg_tto_days`, `avg_ttf_days`, `female_hire_pct`, `oar_pct`, `odr_pct`.

### 8.7 Ageing buckets — L2

| Bucket set | Ranges |
|------------|--------|
| Standard | 0–30, 31–60, 61–90, 90+ days |
| Fine | 0–15, 16–30, 31–45, 45+ days |

**Account ageing risk (L2):** High if `oldest_days > 60` OR ≥30% in 45+ bucket; Medium if oldest &gt;45 OR ≥15% in 45+.

### 8.8 Source effectiveness — L2

Per source label: `offers`, `joiners`, `otj_pct = joiners/offers × 100`.

### 8.9 Client dashboard blocks

| Block | Metrics shown |
|-------|---------------|
| `req_kpi` | Total requisition count |
| `finance_strip` | Revenue actual/budget, attainment, CM, collected, pending, unbilled |
| `pipeline_kpi_strip` | WIP, open, offered, YTJ, ageing, TTO, TTF + period deltas |
| `pipeline_quality_strip` | diversity_pct, rpo_mix_pct, offer_drop_pct |
| `pipeline_analytics_panel` | All snapshot + period metrics + charts |

**Multi-project client:** `mergePipelineForProjects()` sums counts; recomputes ratios from merged numerators/denominators.

---

## 9. Requisitions & Operations

**Route:** `/requisitions`  
**API:** `GET /stats/requisitions/kpis`, `GET /stats/global/monitor`

### 9.1 Requisition KPIs — L3

| Metric | SQL / rule |
|--------|------------|
| **open_req** | `COUNT(records)` WHERE `global_status='ACTIVE'` AND LOWER(status) NOT LIKE '%offer%'` |
| **offer_req** | COUNT where not CLOSED AND (`global_status='PIPELINE'` OR status LIKE '%offer%') |
| **joiners** | COUNT where `global_status='CLOSED'` |
| **total_records** | COUNT all scoped records |

### 9.2 Global monitor — L3 (`GET /stats/global/monitor`)

| Metric | DB derivation |
|--------|---------------|
| **total_positions** | COUNT records |
| **status_breakdown** | GROUP BY `global_status` → CLOSED, ACTIVE, PIPELINE, ON HOLD, UNPROCESSED |
| **JOINED** | COUNT where `joining_date < today` |
| **Yet to Join** | COUNT where `joining_date >= today` |
| **Cancelled** | `total_positions − joined − ytj` (residual) |
| **avg_ageing_days** | Mean `(today − creation_date)` for non-CLOSED with creation_date |
| **ageing_buckets** | 0–30, 31–60, 61–90, 90+ days |
| **revenue_total** | `SUM(revenue_results.revenue)` JSON extract |

### 9.3 Per-project stats — L2

From same endpoint `project_stats[]`:

| Field | Formula |
|-------|---------|
| positions | Total record count per project |
| closed / active / on_hold / pipeline | Count by global_status |
| revenue | Sum `revenue_results.revenue` per project |

### 9.4 Drilldown — L3 top 10

`GET /stats/drilldown?field=hiring_manager|location|department`  
Per dimension value: sum revenue + count records.

---

## 10. Offer & Onboarding

**Route:** `/offer-onboarding`  
**Table:** `candidates`  
**Code:** `backend/core/offer_onboarding_query.py`

### 10.1 KPI summary — L2/L3

| Metric | Formula |
|--------|---------|
| **total** | Count candidates with offer/onboarding signals |
| **open_offers** | Has offer date/CTC, not accepted, no expected DOJ |
| **accepted_pending_doj** | Accepted flag + expected DOJ set, no actual DOJ |
| **joined** | `actual_doj IS NOT NULL` |
| **at_risk** | `early_exit_risk` contains watch/high markers |
| **overdue_checkins** | Joined ≥30/60/90 days ago AND corresponding check-in pending |
| **offer_accept_rate_pct** | `accepted / (accepted + declined) × 100` |

**Population filter:** `apply_offer_onboarding_filter()` — offer date, CTC, accepted flag, joining status, expected DOJ, or stage contains offer/ytj/join.

---

## 11. Revenue Governance

### 11.1 Revenue Visibility — L1/L3

**Route:** `/revenue-trackers` (Visibility tab)  
**Table:** `revenue_visibility_snapshot`

| Metric | L1 | L3 (UI sum/mean) |
|--------|----|--------------------|
| MMF | `mmf_inr` | Σ |
| Opening fee | `opening_fee_inr` | Σ; sub: Σ `open_req` |
| Joining fee | `joining_fee_inr` | Σ; sub: Σ joiners |
| YTJ fee | `ytj_fee_inr` | Σ; sub: Σ `yet_to_join` |
| Gap to MMF | `gap_to_mmf_inr` | Σ |
| Conversion % | `conversion_rate_pct` | Mean across rows |
| Revenue Realised % | `revenue_realised_pct` | Mean across rows |

### 11.2 Weekly Forecast — L1/L3

**Table:** `revenue_forecast_weekly`

| Field | Notes |
|-------|-------|
| `revenue_forecast_inr`, `mmf_inr`, `open_fee_inr`, `joiner_fee_inr`, `to_be_offer_fee_inr` | INR |
| `net_revenue_inr`, `adjustment_inr`, `penalty_inr`, `bad_debts_inr` | INR |
| `open_req`, `joiner_count`, `to_be_offer_count` | Counts |
| **achievement_pct** | Ingested from Excel `Achievement % (Joiner Fee / Rev Fcst)`; ratio 0–2 → ×100 |

### 11.3 Billing tracker — L1/L3

**Route:** `/billing`  
**Table:** `taggd_revenue_billing`

| Display | L3 formula |
|---------|------------|
| Total revenue booked | Σ `revenue_booked_inr` |
| Total net revenue | Σ `net_revenue_inr` |
| Total joining fees | Σ joining fee columns |
| MMF | Σ `mmf_inr` |
| Total joiners | Σ `total_joiners` |
| RPH | Mean `rph_inr` |
| Taggd / Other joiner counts | Sum split columns |
| **% of target** | Stored `pct_of_target` per row (typically net/target × 100) |

### 11.4 Budget / Forecast waterfall — L3

**Route:** `/budget-forecast`  
**API:** `GET /api/budget-forecast/waterfall`  
**Code:** `budget_forecast_ledger.waterfall_from_ledger()`

| Component | Formula |
|-----------|---------|
| **Opening** | Sum `Revenue_MMF.forecast_value` at fiscal start month |
| **Additions** | `total_forecast_in_FY − opening` OR sum new req `revenue_results.revenue` since month start |
| **Closures** | Sum revenue for CLOSED records with joining_date in month |
| **Leakage** | Sum `(opening_fee + closing_fee)` from JSON for ON HOLD/CANCELLED reqs |
| **Total** | `opening + additions − closures − leakage` |

Quarterly budget ingest: Q1–Q4 values split evenly across 3 months per quarter into `finance_monthly_ledger` (`metric_category='Revenue'`, `budget_value`).

---

## 12. Revenue Leakage

**Route:** `/revenue-leakage`  
**API:** `GET /revenue-leakage`  
**Source:** `records` WHERE cancelled/closed-lost

### 12.1 Population

Cancelled clause: CANCELLED global status, cancel markers in status, etc. (`_rl_cancelled_clause()`).

Optional filter: `creation_date` month = `YYYY-MM`.

### 12.2 Per-row calculations (L0)

| Field | Formula |
|-------|---------|
| **ageing_days** | Primary: `approved_date − intake_date`; fallback: `last_update − creation`; else `Days Open` from attrs |
| **ageing_bucket** | 0–2, 3–5, 6–9, &gt;10, No data |
| **sla_48h** | Working hours from `creation_date` → `approved_date`; Met if ≤48h |
| **source_of_hire** | From `additional_attributes` |
| **commercial_class** | Beneficial if SOH in beneficial list, else Loss |

### 12.3 Summary — L3

| Metric | Formula |
|--------|---------|
| **total_cancelled** | COUNT filtered records |
| **avg_ageing_days** | Mean of non-null ageing_days |
| **sla_48h_met / not_met / no_data** | Counts |
| **sla_48h_pct** | `met / (met + not_met) × 100` |
| **RPO beneficial share** | Frontend: RPO cancelled count / total × 100 |

---

## 13. Tracker-derived revenue

**Not the same as finance ledger.**

### 13.1 Per-record (L0)

Each project may have sandboxed `calculate(row)` logic (`revenue_logic_loader.py`) producing JSON:

```json
{ "revenue", "opening_fee", "closing_fee", ... }
```

Stored in `records.revenue_results`. Lakhs heuristic: values &lt;1000 may be scaled.

### 13.2 Portfolio (L3) — `GET /stats/global`

| Metric | Formula |
|--------|---------|
| total_revenue | Σ `revenue_results.revenue` |
| total_opening_fees | Σ `opening_fee` |
| total_closing_fees | Σ `closing_fee` |
| total_joinees | COUNT where global_status = CLOSED |
| total_records | COUNT records |
| total_projects | COUNT scoped projects |

---

## 14. Portfolio Intelligence composite scores

**Route:** `/portfolio`  
**API:** `GET /stats/global/monitor` → `portfolioCompositeVm()`

All inputs from `project_stats` (records table aggregates). **L2 per project:**

| Score | Formula (0–100) |
|-------|-----------------|
| **Fill %** | `closed / positions × 100` |
| **Activity %** | `(closed + active) / positions × 100` |
| **Hold penalty score** | `100 − (on_hold / positions × 100)` |
| **Revenue score** | `min(100, (rev/pos / max_rev_per_pos) × 100)` or vs ₹200k/pos if median=0 |
| **Composite** | `0.40×fill + 0.30×activity + 0.20×hold + 0.10×revenue` |

**Status band:** Strong ≥75, Watch 50–74, At Risk &lt;50 (by composite).

---

## 15. Executive Risk Radar

**Component:** Executive Overview → Risk radar table  
**Code:** `frontend/src/lib/executive-risk-radar.ts`

### 15.1 Per-client domain scores (L2)

| Domain | Score formula | Weight |
|--------|---------------|--------|
| Budget Revenue | `(actual / budget) × 100` clamped 0–100 | 30% |
| Actual Revenue YoY | `(actual / prior_actual) × 100` clamped | 25% |
| CM % | `(cm% / 35) × 100` clamped | 25% |
| SLA | `met / (met+not_met) × 100` from latest SLA rows | 20% |

**Composite:** Renormalized weighted average over **available** domains only.

**Risk band:** HIGH &lt;45, MED 45–69, OK ≥70.

### 15.2 Drawer context (not in score)

positions, closed, active, on_hold, pipeline, pipeline_revenue_inr (from tracker), finance_actual_inr, finance_budget_inr.

---

## 16. Data Operations integrity metrics

**Route:** `/data-operations`  
**API:** `GET /data-ops/summary`

| Metric | DB query | Notes |
|--------|----------|-------|
| **Split clients** | Same `account_name` on multiple `projects` rows | List of (name, count) |
| **Revenue risk (CLOSED≠fee)** | CLOSED AND `revenue_results.revenue=0` AND `closing_fee=0` | Count |
| **Missing joining date** | CLOSED AND `joining_date IS NULL` | Count |
| **Placeholder candidate IDs** | `candidate_name LIKE 'REQ://%'` | Count |
| **Missing location** | location null or empty | Count |
| **Data Quality Score** | `100 − penalties` | −6 per split client (max 60); −10 per 4000 revenue risks (max 30); −10 per 5000 missing joining (max 40); −10 per 50000 placeholders (max 20); floor 0 |

---

## 17. Projections (forward model)

**Route:** `/projections`  
**Input:** Filtered `GET /finance/data` rows → monthly aggregates  
**Code:** `frontend/src/lib/projections-forecast.ts`

**Not official budget/forecast** — statistical projection from history.

| Step | Formula |
|------|---------|
| Monthly history | Sum rev/CM/collected/target by calendar month |
| MoM growth | Average of last min(6, n) months: `(rev[i]−rev[i−1])/rev[i−1]` |
| Damped growth | `clamp(momAvg × 0.75, −0.20, 0.25)` |
| CM ratio | Mean of `cm/rev` over tail months (default 15% if no rev) |
| Collection ratio | Mean of `collected/rev` over tail (default 85%) |
| Forward revenue | `rPrev × (1 + growth)` each month |
| Forward CM | `rev × cmRatio` |
| Forward collected | `rev × collRatio` |
| Uncertainty band | ±12% on revenue (`BAND = 0.12`) |

**KPI displays:** Next month projected revenue, implied CM (INR + %), implied collections, sum of N-month forward revenue.

---

## 18. Other operational pages

### 18.1 Client onboarding (`/transitions`)

| Metric | Formula |
|--------|---------|
| Active | COUNT status = `in_progress` |
| Closed | COUNT status ∈ `{live, soft_launched}` |
| Avg ageing | Mean `ageing_days_effective` excluding live/soft_launched/cancelled |
| Pipeline | COUNT status = draft or null |

### 18.2 Vendor licenses (`/vendor-licenses`)

| Metric | Formula |
|--------|---------|
| Vendor count | Row count |
| Σ License cost | Σ `cost_inr` (FY-filtered when set) |

### 18.3 Tasks (`/tasks`)

Visible count, open/active count, overdue (due date past & status open).

### 18.4 Client detail SLA/WFM strip (`/clients/:clientId`)

| Metric | Source |
|--------|--------|
| SLA % met | Account timeseries Met% |
| WFM capacity fill | Σ actual / Σ ideal for client's projects |
| Productivity target | Ideal-weighted lateral productivity |
| HC gap | ideal − actual |

### 18.5 Client detail requisition ribbon

Total reqs, open, closed/joined, revenue (tracker), fill rate = closed/total, avg ageing from open reqs.

---

## 19. API endpoint index

| Endpoint | Metrics returned | Level |
|----------|------------------|-------|
| `GET /finance/data` | All finance L1 rows + derived KPIs | L1 |
| `GET /finance/stats` | Portfolio finance summary | L3 |
| `GET /sla/stats` | portfolio_health, met/not_met counts | L3 |
| `GET /sla/data` | All metrics + latest performance | L0/L1 |
| `GET /sla/timeseries` | Monthly Met% by account | L2 |
| `GET /sla/account-metrics-timeseries` | Per-metric monthly buckets | L1 |
| `GET /wfm/stats` | Fill rate, HC totals, WL distribution | L3 |
| `GET /wfm/data` | Per-client benchmark rows | L1 |
| `GET /stats/global` | Tracker revenue totals | L3 |
| `GET /stats/global/monitor` | Positions, ageing, per-project stats | L2/L3 |
| `GET /stats/requisitions/kpis` | open/offer/joiners counts | L3 |
| `GET /stats/drilldown` | Revenue by dimension | L3 |
| `GET /client-dashboard/summary` | Pipeline metrics + finance snapshot | L2 |
| `GET /revenue-leakage` | Cancellation analytics | L3 |
| `GET /data-ops/summary` | Integrity scores | L3 |
| `GET /api/budget-forecast/waterfall` | Revenue waterfall components | L3 |
| Revenue tracker routers | Weekly forecast + visibility rows | L1 |
| Billing router | FY billing rows | L1 |
| Candidates offer-onboarding summary | Offer pipeline KPIs | L2/L3 |

---

## 20. File index

| Area | Backend | Frontend |
|------|---------|----------|
| Finance merge + formulas | `backend/main.py` | `lib/dashboard-aggregates.ts`, `lib/view-models/finance.ts` |
| Finance ingest | `backend/scripts/ingest_finance.py` | — |
| Finance manual upsert | `backend/routers/finance_ledger.py` | `components/finance/*` |
| SLA | `backend/core/sla_period.py`, `routers/sla_metrics.py` | `pages/SLAPerformance.tsx`, `lib/sla-rag.ts` |
| WFM | `backend/main.py`, `scripts/ingest_wfm.py` | `lib/view-models/wfm.ts`, `pages/WorkforceManagement.tsx` |
| Pipeline | `backend/core/client_pipeline_metrics.py` | `lib/client-pipeline-metrics.ts` |
| Client dashboard | `backend/routers/client_dashboard.py` | `pages/ClientDashboard.tsx` |
| Executive / CEO | — | `pages/Dashboard.tsx`, `pages/CeoView.tsx`, `lib/executive-risk-radar.ts` |
| Portfolio composite | — | `lib/view-models/portfolio.ts` |
| Projections | — | `lib/projections-forecast.ts` |
| Revenue leakage | `backend/main.py` | `pages/RevenueLeakage.tsx` |
| Budget waterfall | `backend/core/budget_forecast_ledger.py` | `pages/BudgetForecast.tsx` |
| Schema | `backend/db/database.py` | — |
| Authoritative finance doc | `FINANCE_METRICS_AND_UPDATES_REFERENCE.md` | — |

---

## Appendix A — Quick reference: CM % and attainment everywhere

| Surface | CM % formula | Attainment formula |
|---------|--------------|-------------------|
| Finance row (L1) | `cm_actual / rev_actual × 100` | `rev_actual / rev_budget × 100` |
| Executive aggregate (L3) | `Σ cm / Σ rev × 100` | `Σ rev_actual / Σ rev_budget × 100` |
| `/finance/stats` (L3) | `total_cm / revenue_actual × 100` | Same |
| Risk radar CM score | `(cm% / 35) × 100` | `(actual/budget) × 100` |
| Account scorecard (L2) | `Σ cm / Σ rev × 100` | — |

---

## Appendix B — Revenue source reconciliation

| Source | Table / field | Used for |
|--------|---------------|----------|
| Corporate finance actual | `finance_monthly_ledger` Revenue actual | Finance Command, Executive, CEO |
| Tracker calculated | `records.revenue_results` | Portfolio Intel, global stats, waterfall closures |
| Weekly forecast | `revenue_forecast_weekly` | Revenue Trackers |
| Visibility snapshot | `revenue_visibility_snapshot` | Revenue Trackers |
| Billing FY row | `taggd_revenue_billing` | Billing page |

These are **not auto-reconciled**. Compare only with explicit business mapping.

---

*Maintainers: update this document in the same PR when metric logic changes.*
