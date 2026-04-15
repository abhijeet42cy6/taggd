# SLA dashboard — frontend updates

This note records the React SLA experience updates that align the in-app **SLA Performance** area with the richer chart coverage from the reference **TAGGD / SLA Dash** HTML prototype (`dashboard_exp/SLA Dash/TAGGD_Dashboard_ENHANCED.html`), while keeping data wired to live APIs (`/sla/stats`, `/sla/data`, `/sla/timeseries`, etc.).

## Goals

- Close **visual and analytic gaps** between the static HTML dashboard and the workspace UI.
- Reuse **Recharts** patterns already used under `frontend/src/components/platform/Charts.tsx`.
- Prefer **client-side rollups** from existing time-series and SLA rows before adding new backend endpoints.

## Files touched


| Area                                 | Path                                          |
| ------------------------------------ | --------------------------------------------- |
| SLA page shell & views               | `frontend/src/pages/SLAPerformance.tsx`       |
| Shared chart primitives              | `frontend/src/components/platform/Charts.tsx` |
| Scoped layout / tokens for SLA shell | `frontend/src/styles/sla-dash-ui.css`         |


## New chart components (`Charts.tsx`)


| Component                    | Purpose                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `SlaFyPortfolioMetNotMetBar` | Grouped bars: **Met vs Not met snapshot counts** for each FY window (portfolio roll-up).          |
| `SlaFyComparisonGroupedBar`  | Same FY **%** comparison as the line chart, as **grouped bars** (e.g. regions).                   |
| `SlaExecutiveMetPctBar`      | Horizontal bars: **Met %** by account (executive “best / worst” style).                           |
| `SlaExecutiveDeltaBar`       | Horizontal bars: **FY change in Met %** (positive green, negative red).                           |
| `SlaMetNotMetDonut`          | **Doughnut** for Met vs Not met counts in a single FY window.                                     |
| `SlaBenchmarkGroupedBar`     | **Client Met % vs portfolio Met %** in period 2 (benchmark **proxy** until external feeds exist). |
| `SlaNotReportedCountBar`     | Vertical bars for **not-reported snapshot counts** by dimension.                                  |


Existing exports such as `SlaTimeSeriesChart`, `SlaComplianceBar`, and `SlaFyComparisonLineChart` remain the primary building blocks; the new components extend them for parity with the HTML dash.

## `SLAPerformance.tsx` — view-level behaviour

- **Overview**  
  - Portfolio **Met % by month** (unchanged conceptually).  
  - **FY Met vs Not met counts** with **Indian FY / Calendar** toggle (shared `fyMode` with Year-over-Year).
- **Executive**  
  - Top / bottom accounts and most improved / declined are shown as **small horizontal bar charts** instead of text-only lists.
- **Year-over-year**  
  - Retains FY **line** comparison by client.  
  - Adds **regional FY line** chart and a **portfolio mix** card with **two doughnuts** (P1 and P2).
- **Project analysis**  
  - Adds **Top accounts — FY Met % trend**: the ten accounts with the most time-series activity, **P1 vs P2** as a line chart (similar intent to the HTML “account trend” view).
- **Regional**  
  - **Toggle**: grouped **bars** vs **line** for the same `fyRegionalChartData`.
- **Practice head**  
  - Still driven by FY roll-ups; uses existing FY comparison line chart.
- **Industry benchmarking**  
  - Replaces placeholder copy with `**SlaBenchmarkGroupedBar`**: top clients by **P2 Met %** vs **portfolio P2 Met %**.  
  - Short disclaimer: replace with real industry benchmarks when API or sheets are available.
- **Not reported**  
  - Dedicated **summary** plus four charts sourced from **time-series `not_reported`** (and copy referencing **table** not-reported row counts): by **account**, **region**, **practice head**, and **monthly trend**.

## Styling (`sla-dash-ui.css`)

Scoped under `**.sla-dash-scope`** so SLA-specific layout (sidebar, topbar, cards, metric grid, rank grid) does not leak globally. Theme follows platform tokens used elsewhere.

## FY period logic

Indian FY and calendar presets for P1/P2 remain in `frontend/src/lib/sla-fy.ts` (`periodMonthSet`, `formatPeriodLabelShort`, `aggregatePeriod`). Charts that compare two windows depend on months present in **`/sla/timeseries`** payloads.

## Benchmarking caveat

The “benchmark” series is **portfolio Met % in period 2**, not an external industry index. When benchmark data is ingested, prefer extending the API and passing a distinct series into `SlaBenchmarkGroupedBar` (or a successor component).

## Verification

From `frontend/`:

```bash
npx tsc --noEmit
```

## Branch scope (bundled commits on `feature/sla-dashboard-docs-and-charts`)

This branch also carries the rest of the workspace updates that were in flight alongside the SLA work:

- **Backend:** `backend/auth/profile.py`, `backend/routers/revenue_weekly_submission.py`, seed scripts under `backend/scripts/`.
- **Docs:** `DATABASE_SCHEMA.md`, `USER_ACCESS_IMPLEMENTATION.md`.
- **Finance UI:** `frontend/src/components/finance/FinanceExecDashboard.tsx`, `frontend/src/styles/finance-exec-dashboard.css`, static assets under `frontend/public/finance-dashboard/`, and wiring in `App.tsx`, `FiscalPerformance.tsx`, `RevenueTrackers.tsx`, plus `api.ts` / `auth.tsx` / `AdminUsers.tsx` and `package.json` / lockfile.
- **Reference exports:** `dashboard_exp/` (HTML/CSS/JS prototypes, including `SLA Dash` and finance dashboards). Nested `.git` directories under those folders were removed so the tree is stored as normal files in this repo (not submodules).
- **Housekeeping:** tracked `*.pyc` bytecode files were removed from Git; rely on local `__pycache__/` (ignored) instead.

---

*Last updated: March 2026 — SLA Performance / chart parity plus related frontend, backend, and reference dashboard assets on this branch.*