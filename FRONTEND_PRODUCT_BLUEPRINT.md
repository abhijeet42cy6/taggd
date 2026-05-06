# Frontend Product Blueprint (Executive to Requisition Drilldown)

## 1) Product Objective

Build a single decision platform where users can:

- Start with an organization-wide snapshot.
- Drill into portfolio/project/client performance.
- Drill further into requisition-level truth.
- Move across Finance, SLA, Workforce, and Hiring pipelines in one connected experience.
- Access every available dataset either as visual summaries or tabular evidence.

This blueprint assumes Honeywell data may exist across multiple project IDs due to upload mismatch and should be unified by logical client identity in the UI layer.

---

## 2) User Personas and What They Need

## CEO / CXO / Board

- 60-second organizational health snapshot.
- Risk and variance signals (budget, delivery quality, capacity gaps).
- Trend direction and outlier clients.
- Fast jump to "why" and "where to intervene."
- **CEO's View** (`/ceo-view`): board-style pulse metrics (**Revenue per hire**, **Rev / WL1**) scoped to the **Taggd joiner sheet cohort** and formulas in **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §9 (distinct from Executive Overview’s FY-wide portfolio tiles in §8).

## Finance Head

- Budget vs forecast vs actual attainment.
- Revenue and contribution margin trend integrity.
- Cashflow, collection efficiency, and leakage flags.
- Duplicate or anomalous financial rows visibility.

## Workforce Management Head

- Hiring capacity vs ideal HC.
- Fill velocity, ageing, open requisitions by level.
- Workforce productivity and WL distribution.

## Client Managers

- Client-specific scorecard across SLA + hiring + finance.
- Requisition-level detail with latest statuses.
- Month-over-month client movement and issue traceability.

## Platform Handler / Ops

- Data quality health and ingestion audit.
- Mismatch, duplicates, nulls, stale data, unexpected labels.
- Ability to inspect raw rows behind every chart.

---

## 3) Information Architecture

## Sidebar (Primary Navigation)

1. `Executive Overview`
2. `Portfolio Intelligence`
3. `Clients`
4. `Requisitions`
5. `Finance Command`
6. `SLA Performance`
7. `Workforce Management`
8. `Data Operations`
9. `Ingestion Center`
10. `Saved Views` (optional for role-specific presets)

## Top Navbar (Persistent Controls)

- Global date range selector (Month / Quarter / FY).
- Global client/project selector (multi-select).
- Domain filter chips: `Hiring`, `Finance`, `SLA`, `WFM`.
- "Quality Status" badge (Good / Warning / Critical).
- Search bar (client name, project name, requisition ID, hiring manager).
- Export button (current view as CSV/XLSX/PDF).
- User role switch (view-as persona).

---

## 4) Core Navigation Flow (Pages -> Connections)

## A. Executive Overview

Purpose: boardroom-ready snapshot in one screen.

### Visual section

- KPI ribbon:
  - Total Active Clients
  - Total Open Requisitions
  - Revenue Actual (YTD)
  - Budget Attainment %
  - SLA Met %
  - Capacity Fill Rate
  - Data Quality Score
- Multi-domain trend strip (last 12 months):
  - Revenue actual vs budget
  - SLA met ratio
  - Req closure velocity
  - HC gap trend
- Risk heatmap (Client x Domain):
  - Cells scored Green/Amber/Red for Finance, SLA, WFM, Hiring.

### Tables

- "Top 10 clients needing intervention"
  - client, risk score, biggest failing domain, trend delta, owner.
- "Positive outliers"
  - client, improvement score, top contributing metric.

### Interactions

- Click heatmap client -> opens client slide-over summary (quick card + deep-link).
- Click any KPI -> filtered jump to corresponding domain page.

---

## B. Portfolio Intelligence

Purpose: compare projects/clients and rank performance.

### Visuals

- Bubble chart:
  - X: Budget attainment %
  - Y: SLA met %
  - Bubble size: Revenue actual
  - Color: HC gap severity
- Stacked bar:
  - Req global status distribution by client/project.
- Waterfall:
  - Opening forecast -> additions -> closures -> leakage.

### Tables

- Portfolio score table
  - client/project, finance score, SLA score, WFM score, hiring score, composite score.
- Variance table
  - budget, forecast, actual, delta, delta %.

### Interactions

- Click bubble -> open client page with context carried.
- Toggle between client-level and project-level grouping.

---

## C. Clients (Client 360 Hub)

Purpose: single source of truth for each client (e.g., Honeywell).

### Header block

- Client name
- Linked project IDs (important for split uploads, e.g., 11 and 15)
- Data freshness timestamps by domain
- Account metadata (region, vertical, category, owners)

### Sub-tabs

1. `Overview`
2. `Hiring Pipeline`
3. `Finance`
4. `SLA`
5. `Workforce`
6. `Data Quality`
7. `Activity Timeline`

### Overview tab visuals

- Client KPI cards:
  - total requisitions
  - closure rate
  - revenue (actual, opening, closing fee)
  - SLA met count %
  - HC target vs actual
- Domain mini-trends with spark lines.

### Interactions

- "View all requisitions" -> Requisitions page prefiltered by client.
- "Compare with portfolio median" toggle.

---

## D. Requisitions

Purpose: deep operational execution visibility.

### Visuals

- Funnel chart: Draft -> Open -> Offer -> Joined -> Closed/Cancelled.
- Ageing histogram (0-30, 31-60, 61-90, 90+).
- Geo map or region bar for requisition distribution.

### Main table (high density)

Columns:

- Requisition ID (from additional attributes where available)
- Candidate name
- Position title
- Status
- Global status
- Hiring manager
- Department
- Location
- Offered CTC
- Creation date
- Joining date
- Revenue
- Opening fee
- Closing fee

### Table features

- Column filters and saved filter sets.
- Bulk compare rows.
- Row-level anomaly tags (e.g., inconsistent status mapping, missing dates).

### Row click popup (Requisition Detail Drawer)

- Left: lifecycle timeline (creation -> offer -> join/cancel).
- Right: raw `additional_attributes` JSON viewer.
- Revenue logic outcome panel (inputs and computed outputs).
- Related client and project links.

---

## E. Finance Command

Purpose: financial control tower for planning vs realization.

### Visuals

- Budget vs Actual line chart (monthly).
- Forecast bridge waterfall.
- Contribution Margin trend.
- Cashflow panel:
  - unbilled
  - collection target
  - actual collected
  - bad debt

### Tables

- Budget table by FY quarter.
- Forecast table by month and metric.
- Ledger details table:
  - reporting month, metric category, budget, forecast, actual, actual cost.

### Critical popups

- "Duplicate Finance Rows" popup:
  - month/category grouped duplicates (count, IDs).
  - impact estimate if summed naively.
- "Variance Explain" popup:
  - top drivers of delta by month/domain.

### Notes for current data reality

- UI must visibly warn when repeated month-category rows exist (as seen in Honeywell finance data).
- Include dedupe mode toggle: `Raw Sum` vs `Deduped (first/latest/business rule)`.

---

## F. SLA Performance

Purpose: service quality and compliance visibility.

### Visuals

- Metric compliance matrix:
  - rows = SLA metrics, columns = months, cells colored by status.
- Trend lines for selected metrics (TTF, Time to Hire, CSAT, HM SAT, Diversity).
- Met vs Not Met stacked trend.

### Tables

- Metric definition table:
  - metric label, target threshold, formula/definition, owner.
- Performance table:
  - month, score, RAG status, comments.

### Popups

- Metric drilldown popup:
  - full history for a metric across months.
  - target band visualization.
  - latest two months highlight.

### Data handling notes

- Distinguish month-like labels from non-month rows (header/noise labels).
- Display "Not Reported" explicitly and separate from true performance failures.

---

## G. Workforce Management

Purpose: staffing effectiveness and capacity gap control.

### Visuals

- Ideal HC vs Actual HC bullet chart.
- Capacity fill rate gauge.
- WL1-WL4 distribution stacked bar.
- Open requisitions and gaps trend.

### Tables

- Benchmark snapshot table:
  - reporting date, lateral target, HC target, productivity target, ideal HC, actual HC, WL hires.
- Resource gaps table:
  - req ID, status, hiring type, level, target date.

### Popups

- "Gap to Action Plan" popup:
  - identify biggest gap clusters by level/region.

---

## H. Data Operations (Platform Handler View)

Purpose: trust, integrity, and ingestion quality.

### Visuals

- Data health scorecard:
  - duplicate score
  - null score
  - stale data score
  - mapping confidence
- Data lineage graph:
  - source file -> project IDs -> domain tables.

### Tables

- Ingestion audit log:
  - run ID, file, timestamp, rows read, rows written, warnings, duration.
- Duplicate detector:
  - entity type, duplicate key, count, sample IDs, first seen, last seen.
- Mismatch detector:
  - same client across different project IDs.

### Popups

- "Reconcile Client Identity" popup:
  - merge-map multiple project IDs under one logical client.
- "Rule Inspector":
  - inspect current dedupe rule and metric parser behavior.

---

## I. Ingestion Center

Purpose: controlled data onboarding and progress transparency.

### Sections

- Upload modes: Express and Pro.
- Current / recent jobs with statuses.
- Agent outputs summary:
  - identified sheets
  - mapped columns
  - generated logic explanation
- Validation gate:
  - show schema issues before final commit.

### Popups

- Pre-commit review dialog:
  - row counts per table.
  - potential duplicates if committed.
  - fields with missing critical values.

---

## 5) Cross-Page Drilldown Rules (Must-Have)

- Every chart segment must be clickable and open filtered table evidence.
- Every KPI must have "View Rows" action.
- Every table row must link upward and downward:
  - requisition -> client/project
  - client -> requisitions / SLA / finance / WFM
  - domain metric -> source row and ingest audit entry.
- Preserve filter context while navigating pages.

---

## 6) Standard Table Design Contract

All major tables should support:

- Global + column search
- Multi-filter chips
- Sort and pin columns
- Pagination + row density switch
- CSV/XLSX export with applied filters
- "Open in popup" quick-view
- "Audit trail" column with source filename and timestamps

---

## 7) Popup / Drawer Inventory

1. Requisition detail drawer
2. Client quick profile drawer
3. Metric history modal
4. Finance duplicate analyzer modal
5. Data lineage modal
6. Ingestion run detail modal
7. Identity reconciliation modal
8. Variance explanation modal

Each popup should include:

- Summary
- Raw evidence rows
- Download option
- Deep-link to full page

---

## 8) Role-Based Landing Presets

- CEO/Board: open at `Executive Overview` with risk heatmap and top actions.
- Finance Head: open at `Finance Command` with variance and duplicate warnings.
- WFM Head: open at `Workforce Management` with capacity and ageing alerts.
- Client Manager: open at `Clients` filtered to owned accounts.
- Platform Handler: open at `Data Operations` with ingestion quality queue.

---

## 9) Metrics Library (What to Surface Clearly)

## Hiring/Requisition

- total requisitions, open/closed/on-hold counts
- closure rate
- ageing buckets
- joined vs cancelled
- fee components and realized revenue

## Finance

- budget, forecast, actual (monthly and FY)
- variance absolute and %
- contribution margin
- unbilled, collections, bad debt
- collection efficiency

## SLA

- metric-wise met/not met/not reported
- score vs threshold
- monthly compliance trend
- latest two months comparison

## Workforce

- ideal HC vs actual HC
- lateral HC target
- productivity target
- WL1-WL4 hires
- capacity fill rate and open gaps

## Data Quality

- duplicates by table and key
- stale feeds
- missing critical fields
- label/format anomalies
- project/client identity mismatches

---

## 10) Honeywell Example (How UI Should Handle It)

If one client appears across multiple project IDs:

- Show a unified "Client Identity Card" at top.
- Explicitly list linked projects (`11`, `15`) with domain ownership:
  - `11`: requisitions + budget/forecast
  - `15`: SLA + finance + WFM
- Aggregate KPIs at client level while allowing per-project toggles.
- Show "Data Integrity Note" if duplicate financial month-category rows exist.

---

## 11) Suggested Page Build Sequence

1. Executive Overview
2. Clients (Client 360)
3. Requisitions (deep table + drawer)
4. Finance Command (with duplicate analyzer)
5. SLA Performance
6. Workforce Management
7. Data Operations
8. Ingestion Center integration

---

## 12) UX Principles for This Product

- Start broad, drill fast, always show evidence.
- No metric without source rows.
- No red signal without direct action path.
- Keep executive screens concise; deep data one click away.
- Surface data quality warnings as first-class UI elements, not hidden logs.

---

## 13) Final Outcome

This blueprint creates a full-visibility control system:

- Board-ready top layer.
- Manager-ready operational layer.
- Analyst/handler-ready evidence and quality layer.

It matches current data structure and known realities (cross-project client splits, mixed month labels, duplicate financial records) while keeping navigation simple and drilldowns comprehensive.

