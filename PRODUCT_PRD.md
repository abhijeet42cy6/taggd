# Product Requirements Document (PRD)

## Taggd Intelligence Platform — Control Center

**Document type:** Product & experience specification (functionality, goals, KPIs, metrics)  
**Audience:** Product, design, engineering, customer success  
**Scope:** Web application as implemented in this repository (FastAPI + React “platform” shell)  
**Last updated:** March 30, 2026  

---

## 1. Executive summary

### 1.1 Product in one sentence

A **role-aware operations intelligence web app** that ingests **Excel-based** revenue trackers, **corporate directory** metadata, **SLA**, **workforce**, and **finance** master data; persists a **unified SQLite-backed model**; and surfaces **executive dashboards**, **client cockpits**, **requisition pipelines**, **data-quality remediation**, and optional **AI chat** over live metrics.

### 1.2 Primary goals (why it exists)


| Goal                     | Description                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Single pane of glass** | Leadership and ops see portfolio health (hiring, revenue recognition, SLA, WFM, finance) without spreadsheet hopping.                   |
| **Trust in numbers**     | Explicit **data operations** views score integrity and list evidence rows (revenue/joining anomalies, duplicate account identities).    |
| **Fast ingestion**       | **Express** and **Pro** Excel paths plus bulk **SLA / WFM / Finance** uploads reduce time-to-insight.                                   |
| **Governed access**      | **Admin / executive / manager** roles with **project-level assignments** for managers; executives can be org-wide or assignment-scoped. |
| **Auditability**         | **Activity log** and ingestion-oriented events support “who did what, when.”                                                            |


### 1.3 Success themes (design-level KPIs)

These are **product health indicators** the UI is built to support—not a substitute for customer-specific SLAs.

- **Time-to-first-dashboard (TTFD):** User completes login → sees non-empty executive KPIs after at least one successful ingestion path.  
- **Integrity resolution rate:** Count of **revenue-risk** and **missing-joining** rows trending down week-over-week after remediation (recalculate / data fixes).  
- **Adoption by surface:** Active users per primary route (`/`, `/clients`, `/finance`, `/ingestion`) from analytics (external).  
- **Ingestion success rate:** Ratio of successful vs failed ingestion events (from **Ingestion Center** / **Activity log** semantics).

---

## 2. Users, roles, and information architecture

### 2.1 Authentication model

- **Email + password** with **JWT** (Bearer). Session is **browser-local** (token storage); server is **stateless** for auth.  
- **Logout / login** clears client-side API cache and lands users on **Executive Overview** (`/`) to avoid cross-user stale routes and cached responses.

### 2.2 Roles (authorization)


| Role          | Intent                          | Data scope (backend-enforced)                                                                                 |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **admin**     | Full platform operators         | **Unrestricted** — all projects and records.                                                                  |
| **executive** | Leadership / regional oversight | **Unrestricted** if **no** explicit `user_project_assignments`; otherwise **only assigned** `project_id`s.    |
| **manager**   | Delivery / account leads        | **Only** assigned `project_id`s; **cannot** create brand-new account projects without assignment (by policy). |


**Admin-only UI:** **Users & access** (`/admin/users`) — create users, roles, passwords, and **project assignments**.

### 2.3 Experience personas (UI lens, not security)

The shell supports **persona** switching (CEO, Finance Head, WFM Head, Client Manager, Platform Ops) to **filter navigation emphasis** and landing context. **Security is still enforced by role + backend scope**, not by persona alone.

---

## 3. Information architecture (routes)


| Route                | Nav label (typical)     | Purpose                                                                                                                      |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Executive Overview      | Primary KPI dashboard: global stats, monitor, finance/SLA/WFM slices, YoY charts, filters (FY India).                        |
| `/portfolio`         | Portfolio Intel         | Cross-client **composite scores**, bubble and stacked-bar views, exportable table.                                           |
| `/clients`           | Clients                 | Account directory-style hub; navigate to **client cockpit** by account.                                                      |
| `/clients/:clientId` | (detail)                | Single-account drill-down (encoded `clientId` = account identifier).                                                         |
| `/requisitions`      | Requisitions            | Portfolio requisition table and **pipeline KPIs** (open / offer / joiners).                                                  |
| `/finance`           | Finance Command         | Finance ledger KPIs, trends, waterfall (budget/forecast bridge), ledger grid, upload.                                        |
| `/revenue-trackers`  | Revenue trackers        | **Weekly revenue forecast** and **visibility snapshot** tables (operational revenue tracking).                               |
| `/sla-performance`   | SLA Performance         | SLA stats, heatmaps / time series, account-metric drilldowns, master upload.                                                 |
| `/wfm`               | Workforce Mgmt          | WFM benchmarks, resource gaps, master upload.                                                                                |
| `/data-operations`   | Data Operations         | **Trust score**, integrity KPIs, paginated **evidence** for revenue risk and missing joining dates.                          |
| `/ingestion`         | Ingestion Center        | **Express / Pro** tracker uploads, **metadata** directory upload, **SLA / WFM / Finance** bulk uploads, live stepper + logs. |
| `/activity`          | Activity log            | Unified timeline of user-visible actions (ingestion, edits, KPI changes, etc.).                                              |
| `/agent`             | (optional / direct URL) | **Read-only** Gemini chat over DB tools (“Nexus” analyst).                                                                   |
| `/admin/users`       | Users & access          | Admin user CRUD + project assignment matrix.                                                                                 |


---

## 4. Functional modules (deep dive)

### 4.1 Executive Overview (`/`)

**User goal:** Answer “How is the business doing **right now** across hiring, revenue, finance, SLA, and WFM?” under optional **filters**.

**Primary data sources (APIs):**  
`GET /stats/global`, `GET /stats/global/monitor`, `GET /projects`, `GET /finance/stats`, `GET /finance/data`, `GET /sla/stats`, `GET /wfm/stats`, `GET /stats/requisitions/kpis`, `GET /stats/drilldown`, budget-forecast waterfall (via `queries.budgetForecastWaterfall`).

**KPIs & numbers shown (representative):**


| Metric / group               | Definition (product)                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global stats**             | `total_revenue`, `total_opening_fees`, `total_closing_fees`, `total_joinees` (CLOSED rows), `total_records`, `total_projects` — scoped to user’s projects.                                                                                                                                                                              |
| **Command center monitor**   | `total_positions`; **status_breakdown** (`CLOSED`, `ACTIVE`, `PIPELINE`, `ON HOLD`, `UNPROCESSED`); **req_status_breakdown** (`JOINED`, `Yet to Join`, `Cancelled`); **ageing_summary** (average days open, buckets 0–30 / 31–60 / 61–90 / 90+); **revenue_total**; **per-project** positions, closed/active/on_hold/pipeline, revenue. |
| **Requisition KPIs**         | `open_req`, `offer_req`, `joiners`, `total_records` (pipeline semantics aligned with tracker `status` + `global_status`).                                                                                                                                                                                                               |
| **Drilldown**                | Top 10 by **revenue** and **count** for `hiring_manager`, `location`, or `department`.                                                                                                                                                                                                                                                  |
| **Finance (aggregated)**     | Derived from finance rows + stats VM: revenue/CM/productivity style rollups; **Indian FY** (Apr–Mar) filters on month/quarter/region/vertical/account/leadership dimensions.                                                                                                                                                            |
| **Composite / risk helpers** | **Composite score** heuristic (fill 40%, activity 30%, hold-free 20%, revenue quality 10%) and **worst domain** hint (Hiring / SLA / Finance / WFM) for narrative prioritization.                                                                                                                                                       |


**Design notes:** Heavy **client-side aggregation** on finance rows for charts; depends on data freshness (see §7).

---

### 4.2 Portfolio Intelligence (`/portfolio`)

**User goal:** Rank and compare **clients/projects** by hiring effectiveness and revenue weighting.

**KPIs:**  

- **Bubble chart:** X ≈ fill rate, Y ≈ activity rate, size ∝ revenue (top 7 with positions).  
- **Stacked bar:** Top 8 by volume — joined vs open vs offer-pipeline vs on-hold.  
- **Composite table:** Same composite formula as Executive Overview; **CSV export** affordance.

---

### 4.3 Clients hub & client cockpit (`/clients`, `/clients/:clientId`)

**User goal:** Find an account, see **health score** and rollups, drill into **records** and context.

**Data:** Projects (directory-enriched metadata), global monitor stats merged by `project_id`, optional **persona scoped client list**.

**Numbers:** Composite score per account (or neutral 50 if no stats), revenue and position rollups, status tags (**Strong / Watch / At Risk**).

---

### 4.4 Requisitions (`/requisitions`)

**User goal:** Operate the **requisition / position tracker** at portfolio scale — search, filter, paginate, edit rows.

**Backend capabilities:**  
`GET /records/all` (paginated), `PATCH /records/{id}`, `DELETE /records/{id}`, `POST /records` (manual create), project-scoped reads.

**KPI strip:** Uses `GET /stats/requisitions/kpis` for headline **open / offer / joiners / total**.

---

### 4.5 Finance Command (`/finance`)

**User goal:** Inspect **monthly finance ledger** (lac-based ingestion), **variance vs budget**, **waterfall** (budget–forecast bridge), and **productivity** blocks; upload new finance master.

**Tabs (typical):** Overview, Ledger (filterable grid), productivity averages.

**KPIs (from `financeStats` VM + rows):** Account-level revenue/CM/WL1 headcount and ratios; charts for trend and waterfall.

**Ingestion:** `POST /finance/upload` (Excel).

---

### 4.6 Revenue trackers (`/revenue-trackers`)

**User goal:** Operational **weekly revenue forecast** lines and **visibility snapshots** (per project), filterable by project; supports refresh and cache invalidation for this surface.

**APIs:** Dedicated `revenue-trackers` query endpoints in `api.ts` (weekly forecast + visibility lists).

---

### 4.7 SLA Performance (`/sla-performance`)

**User goal:** Monitor **contractual SLA** reporting — met / not met / not reported by month and account; optional per-metric time series.

**Ingestion:** `POST /sla/upload`.  
**Reads:** `GET /sla/stats`, `GET /sla/data`, `GET /sla/timeseries`, `GET /sla/account-metrics-timeseries`.

---

### 4.8 Workforce Management (`/wfm`)

**User goal:** View **HR benchmarks** and **resource gap** analyses from WFM master.

**Ingestion:** `POST /wfm/upload`.  
**Reads:** `GET /wfm/stats`, `GET /wfm/data`.

---

### 4.9 Data Operations (`/data-operations`)

**User goal:** **Trust operations** — see a **quality score** and **actionable lists** of bad rows / split identities.

**Headline KPIs (`GET /data-ops/summary`):**


| KPI                             | Meaning                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **quality_score**               | Heuristic 0–100 penalizing split accounts, revenue-risk volume, missing joining on CLOSED, placeholders, missing location (formula in backend). |
| **split_clients**               | `(account_name, count)` where **multiple `Project` rows** share the same `account_name`.                                                        |
| **revenue_closed_zero_count**   | `global_status = CLOSED` but `revenue` and `closing_fee` in JSON results are both 0.                                                            |
| **missing_joining_count**       | `CLOSED` without `joining_date`.                                                                                                                |
| **placeholder_candidate_count** | `candidate_name` like `REQ://…` (synthetic identity).                                                                                           |
| **missing_location_count**      | Empty location.                                                                                                                                 |


**Evidence tables:** Paginated **projects** and **records** for revenue risk and missing joining; user can drive remediation (e.g. **recalculate** on project from other flows).

---

### 4.10 Ingestion Center (`/ingestion`)

**User goal:** Run **all upload pipelines** with **visible steps**, **timestamps**, and **outcomes**.

**Pipelines:**


| Path                    | Flow                                                    | Purpose                                                                                                                        |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Express**             | `POST /upload`                                          | Auto sheet ID → column map → **generated Python revenue logic** → record upsert; auto match / create project (policy by role). |
| **Pro**                 | `POST /upload/pro/inspect` → `POST /upload/pro/confirm` | User confirms sheets before heavy processing.                                                                                  |
| **Project metadata**    | `POST /projects/metadata/upload`                        | Bulk **directory** fields (charge code, region, heads, etc.).                                                                  |
| **SLA / WFM / Finance** | respective `POST …/upload`                              | Master file ingestion.                                                                                                         |
| **Budget / forecast**   | `POST /api/upload/budget-forecast` (and related APIs)   | Planning workbook sync (separate FastAPI path prefix `/api/...` on server).                                                    |


**UX:** Stepper states (pending / running / done / error), scrollable log, links to **ingestion events** feed where applicable.

---

### 4.11 Activity log (`/activity`)

**User goal:** **Audit narrative** across ingestion, requisition edits, KPI posts, budget actions, etc.

**API:** `GET /activity/log` (paginated `limit` / `offset`), scoped by role.

---

### 4.12 Taggd Intelligence Agent (`/agent`)

**User goal:** Natural-language **Q&A** over **live** portfolio, SLA, WFM, finance (read-only).

**Behavior:** Gemini + **function tools**; **sessions in server memory** (lost on API restart). Requires `GEMINI_API_KEY`.

---

### 4.13 Admin — Users & access (`/admin/users`)

**User goal:** Provision users, set **role**, reset **password**, assign **project_ids** for managers (and scoped executives).

**APIs:** `/admin/users`, `/admin/users/{id}`, `/admin/users/{id}/projects`, project list for picker.

---

## 5. Core entities (conceptual data model)


| Entity                           | Role in product                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **User**                         | Login identity; `role`; `is_active`.                                                                                                      |
| **UserProjectAssignment**        | Many-to-many **user ↔ project** for scoped roles.                                                                                         |
| **Project**                      | Client / tracker container: filename, sheets, **pinned revenue logic**, enterprise metadata (charge code, region, heads, practice, etc.). |
| **Record**                       | Requisition row: candidate, position, status, fees, **revenue_results** JSON, **global_status**, dates.                                   |
| **IngestionEvent / ActivityLog** | Audit streams for UI feeds.                                                                                                               |
| **Finance*** tables              | Monthly ledger, cash flow, efficiency KPIs (lac-scale ingestion).                                                                         |
| **SLA***                         | Metric definitions + monthly performance rows.                                                                                            |
| **WFM***                         | HR benchmarks + resource gaps.                                                                                                            |
| **Budget / Forecast**            | Quarterly budget + monthly forecast lines tied to projects where matched.                                                                 |


---

## 6. Fiscal and currency assumptions (design)

- **Indian financial year** (April–March) is first-class in **dashboard filters** and YoY builders (`dashboard-aggregates.ts`).  
- **Currency presentation:** INR-style **large number** and **lac** formatting in finance and tracker views (`LAKHS = 100_000` in revenue trackers).  
- **Topbar FY label** in shell is **static copy** today (“FY2024-25”) — **design debt**: should bind to selected FY or server config.

---

## 7. Freshness, caching, and perceived latency

- Client maintains an **in-memory SWR-style cache** (`cachedGet`) with **TTLs** (order of **10–30s** per domain).  
- **Mutations** should call `**invalidateCache`** for affected prefixes; not every path is exhaustive — users may still see **brief staleness** until TTL expiry or manual navigation.  
- **Design implication:** Prefer **explicit “Refresh”** on integrity-heavy pages (Data Operations already patterns this); consider **toast** after mutations: “Numbers may take a few seconds to refresh.”

---

## 8. Non-goals & constraints (current product)

- **Not** a full **IdP** (no SSO/MFA/SCIM in repo).  
- **Not** multi-tenant SaaS isolation beyond **single SQLite** file + **one org** deployment model.  
- **Agent** does **not** mutate data.  
- **Search** in topbar is **placeholder** (no global search implementation wired).

---

## 9. Appendix — API surface (reference)

Major **read** endpoints: `/stats/`*, `/projects`, `/projects/{id}/records`, `/records/all`, `/data-ops/*`, `/finance/*`, `/sla/*`, `/wfm/*`, `/api/budget-forecast/*`, `/ingestion/events`, `/activity/log`, `/auth/me`.  

Major **write** endpoints: `/upload`*, `/*/upload`, `/records`, `/records/{id}`, `/projects/{id}`, `/api/budget/*`, `/api/forecast/*`, `/admin/*`, `/agent/chat`.

---

*This PRD describes the product as implemented in the repository; deployment topology (GCP, Docker, Cloudflare) is documented separately in `DEPLOYMENT_DOC.md`.*