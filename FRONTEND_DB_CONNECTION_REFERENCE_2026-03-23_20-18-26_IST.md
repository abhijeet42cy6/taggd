# Frontend to DB Connection Reference

**Version timestamp:** 2026-03-23 20:18:26 IST  
**Purpose:** Current-state mapping of frontend pages to backend APIs and DB tables before new frontend redesign.

---

## System Connection Path

Frontend does not connect to DB directly.

`React (frontend)` -> `FastAPI endpoints (backend)` -> `SQLAlchemy models` -> `Database (revenue_generator.db or DATABASE_URL target)`

---

## Routing / Navigation (Current Frontend)

From `frontend/src/App.tsx` and sidebar:

- `/` -> Dashboard
- `/budget-forecast` -> Budget & Forecast
- `/projects` -> Project Vault
- `/projects/:id` -> Project Detail
- `/upload` -> Data Import
- `/audit` -> Placeholder
- `/sla-performance` -> SLA Performance
- `/wfm` -> Workforce Management
- `/finance` -> Fiscal Performance

---

## API to DB Mapping (Current)

## 1) Dashboard

Frontend calls:
- `GET /api/stats/global`
- `GET /api/stats/global/monitor`
- `GET /api/stats/drilldown?field=hiring_manager`

Backend endpoints:
- `/stats/global`
- `/stats/global/monitor`
- `/stats/drilldown`

Primary DB tables touched:
- `records`
- `projects`

---

## 2) Project Vault

Frontend calls:
- `GET /api/projects`

Backend endpoint:
- `/projects`

Primary DB tables touched:
- `projects`

---

## 3) Project Detail

Frontend calls:
- `GET /api/projects/{id}`
- `GET /api/projects/{id}/records`
- `DELETE /api/projects/{id}`

Backend endpoints:
- `/projects/{project_id}`
- `/projects/{project_id}/records`
- `/projects/{project_id}` (DELETE)

Primary DB tables touched:
- `projects`
- `records`

Notes:
- Delete flow removes project + records; domain child-table cleanup is not fully comprehensive.

---

## 4) Upload / Ingestion

Frontend calls:
- `POST /api/upload`
- `POST /api/upload/pro/inspect`
- `POST /api/upload/pro/confirm`

Backend endpoints:
- `/upload`
- `/upload/pro/inspect`
- `/upload/pro/confirm`

Primary DB tables touched:
- `projects` (create/update metadata, logic, mapping)
- `records` (bulk insert from processed rows)

---

## 5) Budget & Forecast

Frontend calls:
- `GET /api/budget-forecast/data`
- `GET /api/budget-forecast/waterfall`
- `POST /api/upload/budget-forecast`
- `POST /api/budget-forecast/recalculate`
- `PUT /api/budget/{project_id}`

Backend endpoints:
- `/api/budget-forecast/data`
- `/api/budget-forecast/waterfall`
- `/api/upload/budget-forecast`
- `/api/budget-forecast/recalculate`
- `/api/budget/{project_id}`

Primary DB tables touched:
- `project_budgets`
- `project_forecasts`
- `projects`
- `records` (actual revenue rollups)

---

## 6) SLA Performance

Frontend calls:
- `GET /api/sla/stats`
- `GET /api/sla/data`
- `POST /api/sla/upload`

Backend endpoints:
- `/sla/stats`
- `/sla/data`
- `/sla/upload`

Primary DB tables touched:
- `metric_definitions`
- `sla_performances`
- `projects`

---

## 7) Workforce Management

Frontend calls:
- `GET /api/wfm/stats`
- `GET /api/wfm/data`
- `POST /api/wfm/upload`

Backend endpoints:
- `/wfm/stats`
- `/wfm/data`
- `/wfm/upload`

Primary DB tables touched:
- `wfm_hr_benchmarks`
- `wfm_resource_gaps`
- `projects`

---

## 8) Fiscal Performance

Frontend calls:
- `GET /api/finance/stats`
- `GET /api/finance/data`
- `POST /api/finance/upload`

Backend endpoints:
- `/finance/stats`
- `/finance/data`
- `/finance/upload`

Primary DB tables touched:
- `finance_monthly_ledger`
- `finance_cash_flow`
- `finance_efficiency_kpis`
- `projects`

---

## Integration Risks / Observations

1. **Mixed API base usage**
- Most pages use relative `/api`.
- `BudgetForecast` uses hardcoded `http://localhost:8000/api`.

2. **Proxy-dependent path behavior**
- Vite rewrites `/api/*` -> backend `/*`.
- Works, but route style inconsistency increases deployment risk.

3. **No central API client/data layer**
- Each page manages fetch, loading, errors independently.
- No shared caching, retries, or stale-state control.

4. **Response shape coupling**
- Several pages use `any` and implicit assumptions.
- Backend contract changes can break UI silently.

5. **Data quality surfaced incompletely**
- Duplicate finance rows and split client identity are not first-class UI warnings in current build.

---

## Current Core DB Models (Referenced by Frontend Flows)

- `projects`
- `records`
- `project_budgets`
- `project_forecasts`
- `metric_definitions`
- `sla_performances`
- `wfm_hr_benchmarks`
- `wfm_resource_gaps`
- `finance_monthly_ledger`
- `finance_cash_flow`
- `finance_efficiency_kpis`

---

## Suggested Use of This File

Use this document as a baseline contract map while implementing the new frontend architecture and drilldown UX.

