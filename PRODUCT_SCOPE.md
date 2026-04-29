# Commercial Proposal — Phase 1 Product Scope

## RevOps Intelligence Platform

**Document type:** Product scope & implementation baseline  
**Audience:** Executive sponsors, programme leads, and enterprise procurement  
**Phase:** Phase 1 — Core platform capabilities (as implemented in the current product codebase)

---

## 1. Executive summary

This proposal defines **Phase 1** of the **RevOps Intelligence Platform** — an enterprise web application that unifies **revenue operations**, **commercial delivery**, **financial visibility**, and **governance** on a single spine: **clients → engagements (projects) → mandates / pipeline (records & candidates)**.

Phase 1 delivers a **role-aware control centre** for leadership, delivery, finance, and recruiting teams, supported by **structured ingestion** from Excel and operational trackers, **portfolio-grade analytics**, **SLA and workforce intelligence**, **billing and revenue governance workflows**, and **AI-assisted productivity** (assistant chat and executive narrative tooling).

---

## 2. Strategic intent & business outcomes


| Outcome theme               | What Phase 1 enables                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One operational spine**   | Shared truth for clients, SBU/BU hierarchies, projects, requisitions, and candidates — reducing fragmentation across spreadsheets and siloed tools.            |
| **Executive confidence**    | Consolidated dashboards for revenue, margin proxies, regional mix, risk signals, and SLA posture — supporting board-ready rhythm without manual consolidation. |
| **Commercial discipline**   | Contract lifecycle views, onboarding milestones, TAGGD-aligned billing capture, finance validation, and weekly revenue packs with workflow states.             |
| **Delivery accountability** | SLA performance analytics (including FY comparison and drilldowns), workforce management benchmarks, and revenue leakage analytics tied to ageing behaviour.   |
| **Trusted data**            | Ingestion centre with guided pipelines, data operations views for integrity risks, and activity logging for operational transparency.                          |
| **Controlled access**       | JWT authentication, role-based navigation, optional vertical scoping, recruiter-focused workspaces, and read-only client portal modes where configured.        |


---

## 3. Solution overview (architecture at a glance)

- **Experience layer:** React application with a unified **platform shell** (navigation, drawers, tables, charts, persona-aware layouts).
- **API layer:** REST APIs under FastAPI, including modular routers for finance ledger, billing, revenue trackers, weekly submissions, workflows, meetings, tasks, transitions, candidates, contracts, WFM, SLA writes, and AI endpoints.
- **Data layer:** SQLAlchemy ORM over SQLite by default (environment-driven database URL), with additive runtime migrations for operational continuity.
- **Cross-cutting:** Authentication (`/auth`), administration (`/admin`), caching on selected reads in the web client, and optional integrations with external AI providers where configured (e.g. agent chat, CEO deck JSON assistance).

---

## 4. Phase 1 functional scope — pillar by pillar

The following reflects **modules present in the shipped application** and how they support RevOps intelligence.

### 4.1 Leadership & portfolio intelligence


| Capability                         | Description                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Executive Overview (Dashboard)** | Global KPIs, finance-informed aggregates, YoY-style executive charts, regional revenue views, risk radar constructs, filters aligned to fiscal reporting, and drilldown affordances. |
| **CEO's View**                     | Leadership-oriented narrative and metric presentation for strategic reviews (distinct route from the main dashboard).                                                                |
| **Portfolio Intel**                | Portfolio-level intelligence across accounts and engagements for prioritisation and narrative alignment.                                                                             |


**Outcome:** A deterministic cockpit for revenue health, concentration, and directional trends rather than ad-hoc slide assembly.

---

### 4.2 Commercial & financial performance


| Capability                             | Description                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finance Command (`/finance`)**       | Fiscal performance workspace tying ledger-aligned metrics, efficiency KPIs, budget vs actual constructs, and variance storytelling suitable for finance operations.               |
| **Projections**                        | Forward-looking revenue / scenario views aligned to internal planning workflows.                                                                                                  |
| **Revenue trackers**                   | Tracker-backed revenue governance aligned with recurring operational submissions (API-backed router).                                                                             |
| **Billing**                            | TAGGD-oriented revenue billing rows, fiscal-year filtering, workflow coupling (draft vs locked states), practitioner submission rules, and integration with validation lifecycle. |
| **Finance validation**                 | Operational validation surface for finance submissions — constrained by role (`nav` + capability helpers such as practice submission checks).                                     |
| **Revenue packs (Revenue governance)** | Weekly submission pipeline: draft → submit → review → approve/reject/changes requested; queues; visibility snapshots; forecast analytics components; governance charts.           |


**Outcome:** End-to-end visibility from **projection → billing capture → validation → governed weekly packs**, reducing revenue surprises and audit friction.

---

### 4.3 Commercial lifecycle & contracts


| Capability                          | Description                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Clients hub & client detail**     | Client hierarchy signals (lifecycle, org-chart tags where populated), engagement lists, deep-links into operational artefacts. |
| **Client onboarding (Transitions)** | Milestone-oriented onboarding records per project, attachments support at data layer, structured progression tracking.         |
| **Contracts**                       | Contract pipeline staging and commercial metadata aligned to `project_contracts` (upload/API-backed flows).                    |


**Outcome:** Aligns **sales-to-delivery handover** with measurable transition checkpoints.

---

### 4.4 Delivery operations — mandates & talent


| Capability          | Description                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Requisitions**    | Full requisition grid with KPI endpoints (`/stats/requisitions/kpis`), linkage to projects and operational analytics. |
| **Candidates**      | Mandate-level candidate pipeline with attribution fields (hiring manager / recruiter user links at record layer).     |
| **Candidate store** | Cross-mandate visibility patterns backed by candidate identity linking (`candidate_masters` / links where enabled).   |
| **Meetings**        | Meeting entities with action-item semantics at schema level for operational cadence.                                  |
| **Tasks**           | Cross-cutting task queue with assignees — universal “workbench” for execution tracking.                               |


Specialised **recruiter navigation** prioritises **tasks → requisitions → candidates → candidate store → meetings → clients**, emphasising throughput for delivery roles.

---

### 4.5 Business excellence — SLA & commitments


| Capability                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SLA KPI (`/sla-performance`)** | Master SLA file ingestion; portfolio KPI ribbon; multi-account **% Met over time** trends; compliance-by-account visuals; **FY comparison** (Indian FY vs calendar toggle) with **account-wise and regional** Met % charts and comparison tables; **account drilldown** with aggregate Met % over time, **per-KPI monthly Met / Not Met** stacked charts, and **Internal vs Contractual KPI** typing derived from metric definitions. |


**Outcome:** Moves SLA discussion from **static spreadsheets** to **time-aware, account drillable analytics** aligned to contractual and internal KPI classes.

---

### 4.6 Workforce management & leakage analytics


| Capability                  | Description                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workforce Mgmt (`/wfm`)** | HR benchmark ingestion; productivity vs fill constructs; visualisations consistent with platform charts; workforce storytelling for HC vs targets.                   |
| **Revenue leakage**         | API-backed leakage analytics with ageing buckets, source-of-hire facets, cancellation reasons, filtering, and operational lists suited to revenue protection forums. |


**Outcome:** Connects **people capacity** and **pipeline ageing** to **revenue risk** in one navigable surface.

---

### 4.7 Vendor & ancillary commercial controls


| Capability                                       | Description                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Vendor Management (resume supplier licenses)** | Org-wide license tracking for resume vendors — spend/coverage discipline for sourcing stacks. |


---

### 4.8 Platform integrity & governance tooling


| Capability                          | Description                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Operations**                 | Summary integrity scorecard; split-client detection signals; **revenue-closed-zero** and **missing joining date** risk queues at project and record evidence levels with pagination.                              |
| **Ingestion Center**                | Multi-track ingestion (express/pro pipelines for trackers, SLA master, WFM uploads), AI-assisted sheet classification & column mapping workflows, progress steps, and cache-aware refresh patterns after commits. |
| **Activity log**                    | Human-readable operational activity feed backed by `activity_log` semantics.                                                                                                                                      |
| **Users & access (`/admin/users`)** | Administrative control of users and assignments (role catalogue includes platform_admin, executive, project_head, operations, recruiter, client_user, etc.).                                                      |


**Outcome:** Makes **trust** a first-class feature — surfacing **where data breaks revenue trust** before leadership consumes dashboards.

---

### 4.9 AI-assisted productivity


| Capability                        | Description                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assistant (`/agent`)**          | Conversational assistant with session persistence, streamed-style UX patterns, markdown rendering, tool-call visibility hooks — backed by `/agent/chat` and session APIs.   |
| **CEO deck AI (`/ceo-deck` API)** | Structured JSON deck editing via natural-language instructions with guarded merging — supports executive storytelling acceleration without abandoning structured artefacts. |


**Outcome:** Accelerates **analysis → narrative → artefact** loops while keeping structured JSON as the contract for downstream rendering.

---

### 4.10 Identity, session & authorisation model (Phase 1)

- **JWT bearer authentication** with `/auth/login` and `/auth/me`.
- **Role-based route prefixes** (`ROLE_NAV_PATHS`) aligning UI navigation to policy; backend dependency checks on protected routes.
- **Project-scoped assignments** for managers/executives via `project_ids` semantics.
- **Vertical access JSON / arrays** for selective industry or practice tower visibility where configured.
- **Client portal users** see **module-gated** dashboards with **read-only** posture when flagged by API.
- **Recruiters** receive constrained navigation enforced client-side with staff fallbacks.

---

## 5. Phase 1 deliverables (acceptance framing)

From a commercial standpoint, Phase 1 **acceptance** can be organised around:

1. **Authenticated multi-role UX** with recruiter, leadership, operations, and admin flows operational end-to-end.
2. **Core financial narrative** available on Executive Overview + Finance Command with coherent drill paths.
3. **Billing → validation → weekly revenue governance** demonstrable on seeded or pilot data.
4. **SLA ingestion + FY/regional analytics + account drilldown KPI charts** functioning against uploaded masters.
5. **Integrity surfaces** (Data Operations + Ingestion Centre evidence) demonstrably identifying configured risk classes.
6. **AI assistant** callable with session continuity; **CEO deck JSON AI** callable for structured edits.

---

## 6. Closing proposition

Phase 1 of the **RevOps Intelligence Platform** is not merely a reporting portal — it is an **operational system of record** for how revenue is **planned, executed, measured, explained, and governed**. It aligns delivery, finance, and leadership on **shared primitives**, surfaces **integrity risks early**, and uses **AI where it amplifies structured decisions** rather than replacing them.

---

*This document describes capabilities evidenced by the current application architecture and navigation model. Deployment-specific SLAs, hosting choices, and commercial licensing terms are addressed outside this technical product scope.*