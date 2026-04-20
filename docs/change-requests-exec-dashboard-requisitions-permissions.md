# Change requests — executive dashboard, requisitions, and user permissions

This document captures the product and technical scope for four related requests. It is a **specification only**; implementation is out of scope for this file.

---

## 1. Executive KPI deck (`exec-kpi-deck` / `ExecutiveKpiCard`)

### 1.1 Context

The dashboard shows an executive grid of KPI cards (e.g. Revenue — Actual, CM %, Collection, Unbilled & bad debt, SLA portfolio, Headcount — WFM, Pipeline — reqs, Active clients). Each card uses a colored header, a primary metric, and a monospace sub-block (`exec-kpi-card__sub`) for key–value rows (e.g. Budget vs Attainment).

### 1.2 Terminology clarification

- The field currently labeled **Budget** in the Revenue card should be understood as the **forecast / target / estimate** for revenue (planning number), not necessarily a separate “annual budget” line in the accounting sense unless you later split those concepts in data and UI.
- **Annual budget** is requested as an explicit concept in addition to (or clearly distinguished from) the existing plan line, once data definitions are agreed.

### 1.3 New metrics to surface (overall forecast layer)

Add an **overall forecast** view (either new sub-rows on existing cards, new cards, or a dedicated forecast strip—product decision) that includes at minimum:


| Area      | Metric                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Revenue   | **Forecasted revenue** (full-year or selected period—must align with fiscal calendar used elsewhere)   |
| Margin    | **Forecasted CM** (contribution margin % or absolute—align with how “CM % — Actual” is computed today) |
| Workforce | **Forecasted headcount** (WFM-aligned or booking-aligned—align with “Headcount — WFM” definitions)     |
| Planning  | **Annual budget** (explicit line; clarify vs current “Budget” if both stay in UI)                      |


Each of these should be **comparable** to actuals already on the deck (same units, same period labels).

### 1.4 Quarterly progression example (user story)

**Scenario:** Total forecast for the year is **100** (currency unit as used in product—e.g. Cr). Plan assumes **25 per quarter**. In **Q1**, actual is only **20**.

**UX expectations (to be designed in implementation):**

- Show **full-year forecast** vs **YTD actual** (and optionally **QTD actual** vs **QTD plan**).
- Make it obvious when a quarter is **behind plan** (e.g. 20 vs 25) and how that affects **run-rate** or **remaining quarters** (optional second phase).
- Consider a **small multi-period breakdown** (Q1–Q4 plan vs actual) on the Revenue card or behind a drill-down, without cluttering every card.

Data must exist or be derivable server-side; if only annual and quarterly targets are stored, document the aggregation rules.

### 1.5 Year-over-year (YoY) comparison

**Requirement:** Show **YoY comparison for all data points** on the executive deck (or for every metric the deck exposes, including new forecast and budget fields).

**Clarifications needed before build:**

- **Baseline year:** prior fiscal year same period (e.g. YTD vs prior YTD), or calendar year?
- **Presentation:** absolute delta, % delta, or both; color rules (green/red) consistent with existing attainment styling.
- **Scope:** “All data” includes primary metrics, sub-metrics (Budget/Target, Attainment, Pending, etc.), and the new forecast/budget fields.

### 1.6 Affected areas (for implementers)

- **Frontend:** `Dashboard` / `ExecutiveKpiCard`, styles for `exec-kpi-deck`, `exec-kpi-card__sub`, possible new rows or card variants.
- **Backend / data:** APIs that feed executive KPIs must expose: annual budget, forecast splits (at least annual; optionally quarterly), prior-year counterparts for YoY, and consistent fiscal period keys.
- **Copy:** Rename or split labels so “Budget” vs “Annual budget” vs “Forecast” are not ambiguous for end users.

---

## 2. Requisitions — “Source joiner” dropdown (`RequisitionCreateDrawer` / NCP sheet)

### 2.1 Requirement

In the **Add requisition** flow (multi-step sheet: Project → Candidate → Role & org → Pipeline), add a **dropdown** capturing how the joiner was sourced, with two top-level families:

**A. Taggd source joiner** (also referred to as external in discussion)

- **RPO**
- **Direct**

**B. Non-Taggd source joiner**

- **Employee referral**
- **Internal job portal**
- **Campus**
- **Transferred**

Exact **labels** in UI should follow casing and wording from design (e.g. title case vs sentence case).

### 2.2 Placement

Logical home: **Pipeline** step (“Pipeline & commercial” or adjacent section), unless product prefers **Role & org**; document final choice in implementation PR.

### 2.3 Data model

- **New persisted field(s)** on the requisition (or related) table: store the choice in a way that supports reporting and filters (enum or lookup table preferred over free text).
- **Migration:** additive migration, backfill strategy for existing rows (NULL vs default “Unknown”), and API/schema updates for create/update/read.
- **Validation:** optional vs required—default recommendation is **required** at submit if operations need clean reporting; confirm with stakeholders.

### 2.4 Reporting

Consider whether SLA, revenue, or WFM reports need this dimension; if yes, surface in exports or filters in a follow-up.

---

## 3. Users & access — CEO / executive permission for executive dashboard

### 3.1 Requirement

Add a **module or permission flag** (e.g. “Executive dashboard” or “CEO / executive”) in the **user access** UI—the grid of checkboxes under the section that explains gating for executive, operations, project head, and recruiter roles.

### 3.2 Behavior

- When **unchecked:** user should not see or access the executive dashboard route/APIs (consistent with how other modules gate `/finance`, `/sla-performance`, etc.).
- When **checked:** grant access aligned with **executive / CEO** persona.
- **Legacy rule:** preserve existing behavior: empty module list vs full list vs “no row in DB” legacy full access—document how this new flag interacts (e.g. executive dashboard might be a separate bit or part of the module list).

### 3.3 Affected areas

- **Frontend:** `AdminUsers` (or equivalent) NCP section body listing modules; routing guard for dashboard home.
- **Backend:** persist module slug in user allow-list; enforce on executive dashboard API endpoints.
- **Auth docs:** update any internal matrix of `vertical` / module slugs.

---

## 4. Cross-cutting notes

- **Executive deck + YoY** depends on **historical snapshots** or **time-series** data quality; validate that prior-year actuals and forecasts exist for each metric.
- **Requisition field** is independent but may later feed **headcount or pipeline** executive metrics if sourcing analytics are required.
- **Executive permission** should be the single switch for “who sees the deck”; avoid duplicating the same gate under multiple confusing names.

---

## 5. Suggested delivery order

1. **Permissions** — unblocks safe rollout of a richer dashboard to only CEO/executive users if needed.
2. **Data model + API** for forecast, budget, prior year (executive KPIs).
3. **UI** for executive deck (forecast rows, YoY, optional quarterly breakdown).
4. **Requisition** DB + UI dropdown + any reporting hooks.

---

## 6. Open questions (for product / engineering sign-off)

1. Is **annual budget** numerically the same as the current **Budget** field, or a second line from finance systems?
2. Fiscal **YoY** definition and timezone / India fiscal alignment.
3. Should **forecasted CM** be % only, INR only, or both?
4. **Requisition** dropdown: single select with grouped options (Taggd vs Non-Taggd) or two-step (family then value)?
5. Exact **module slug** and label for CEO/executive dashboard in the admin grid.

---

*Document generated from stakeholder requests. No code changes in this commit path.*