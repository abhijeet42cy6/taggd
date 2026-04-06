# Project Proposal

## Taggd Intelligence Platform — Control Center

**Document type:** Client proposal — scope of work and deliverables  
**Prepared for:** Taggd Leadership & Programme Sponsors  
**Classification:** Commercial — for discussion  
**Version:** 1.0  
**Date:** 2 April 2026  

---

## 1. Executive summary

This proposal describes the **delivery and evolution** of the **Taggd Intelligence Platform (Control Center)**: a **single operational hub** for monitoring recruitment / RPO delivery, commercial performance, client SLAs, workforce signals, and finance outcomes—with **central logging** of ingestion and key actions so the organisation can **trust its numbers**, **govern access**, and **act on risk early**.

The scope is organised into **clear deliverable phases**: a **core platform** (operational today), **near-term enhancements** that tighten **cadence, notifications, and personal workspaces** without over-scoping, and **roadmap items** that remain valuable but require separate design and investment (e.g. live meeting capture, advanced identity features).

This document focuses on **what you receive**—capabilities, artefacts, and outcomes—not on software implementation detail.

---

## 2. Objectives we are solving for

| Objective | Desired outcome |
| --------- | ---------------- |
| **One place to run the business** | Executives and leads see portfolio health without consolidating spreadsheets. |
| **Policy-correct access** | Each role sees only the clients and data their job requires; administrators control who can do what. |
| **Operational truth** | Forecasts, trackers, masters, and edits flow into **one auditable system** with activity history. |
| **Early risk visibility** | Underperforming projects, weak KPIs, data anomalies, and commercial leakage signals surface before month-end. |
| **Delivery discipline** | Client managers and delivery teams maintain **weekly** commercial and pipeline inputs; leadership can see gaps. |
| **Continuity** | Requisition and outcome history supports handovers, client conversations, and future reference. |
| **Intelligent support** | Users can **ask questions** of live operational data through a guided assistant (read-only analysis). |

---

## 3. Proposed solution (overview)

The platform provides **modular capabilities**—executive dashboards, client cockpits, requisition operations, finance command, SLA and workforce analytics, data quality operations, ingestion centre, activity logging, user administration, and an optional **AI assistant** for exploration of approved metrics.

**Inputs** remain aligned with how Taggd already works: **Excel-based trackers and master files**, supplemented by **in-browser data entry** where appropriate. The platform becomes the **system of record after ingestion and validation**, with **Indian financial year** and **INR-oriented** presentation for leadership views.

---

## 4. Scope of work and deliverables

Deliverables are grouped by **phase**. Unless noted, each item includes **usable software capability**, **brief user-facing guidance** (where new), and **handover suitable for user acceptance testing (UAT)**.

### 4.1 Phase A — Core platform (foundation)

*These capabilities form the baseline operational product.*

| # | Workstream | Deliverables (what you get) |
| --- | ---------- | ---------------------------- |
| A1 | **Secure access & governance** | Role-based access (**Administrator**, **Executive**, **Manager**); secure sign-in; **project-level assignment** for managers (and optional scoping for executives); **user administration** (create users, assign roles, reset access, assign projects). |
| A2 | **Executive command centre** | **Executive Overview**: portfolio KPIs spanning hiring pipeline, revenue/fees from trackers, requisition mix, ageing, finance roll-ups, SLA and WFM headlines, drill-downs (e.g. by hiring manager / location / department), Indian FY-oriented views, year-on-year and regional revenue views, composite health indicators for storytelling. |
| A3 | **Portfolio intelligence** | **Portfolio Intelligence**: cross-client comparison (scores, charts, exportable tables) for reviews and prioritisation. |
| A4 | **Client operations** | **Clients hub** and **client detail (cockpit)**: account directory view, health indicators, roll-ups, navigation into deeper operational data. |
| A5 | **Requisitions & pipeline** | **Requisitions workspace**: search, filter, paginated grid; **create, update, delete** requisitions per policy; portfolio **pipeline KPIs** (e.g. open, offer-stage, joiners, totals); intelligence via dashboards and drill-downs tied to live data. |
| A6 | **Candidate / position continuity** | **Historical requisition records** retaining status, dates, fee/revenue outcomes, lifecycle classification, and extended attributes from trackers—supporting **joined**, **in-play**, and **closed-without-join** continuity for handovers and audits (as data quality allows). |
| A7 | **Finance command** | **Finance Command**: monthly ledger views, budget/actual/forecast narratives, contribution margin, collections, collection targets, **unbilled**, **bad debt**; trends and waterfall / bridge views where data exists; **finance master ingestion**; **steward corrections** via controlled ledger updates where enabled. |
| A8 | **Weekly commercial tracking** | **Revenue trackers**: weekly **forecast** lines and **visibility** snapshots per project, maintainable from the application. |
| A9 | **Budget & forecast planning** | **Budget and forecast** workbook ingestion and comparison views linked to projects where matched. |
| A10 | **SLA performance** | **SLA module**: portfolio statistics, metric detail, **monthly time series**, per-account metric views; **SLA master ingestion**. |
| A11 | **Workforce management** | **WFM module**: HR **benchmarks** and **resource gap** views; **WFM master ingestion**; benchmark maintenance where enabled in product. |
| A12 | **Data operations & trust** | **Data Operations**: **quality/trust score**, split-account detection, **evidence lists** for integrity issues (e.g. closed positions with inconsistent revenue, missing joining dates, placeholder identities, missing location)—supporting **prioritised cleanup**. |
| A13 | **Ingestion centre** | **Ingestion Centre**: guided flows for **Express** and **Pro** tracker uploads; **project metadata / directory** bulk update; bulk **SLA, WFM, and Finance** masters; **budget/forecast** uploads; visible steps, outcomes, and error feedback. |
| A14 | **Activity & audit narrative** | **Activity log**: unified timeline of user-visible actions (ingestion, material edits, KPI-related events, etc.), scoped by access policy. |
| A15 | **Intelligence assistant (read-only)** | **Taggd Intelligence Agent**: conversational **Q&A over live operational data** for exploration and briefing support; **does not** autonomously change business data. |
| A16 | **Experience personalisation (navigation)** | **Persona-style navigation emphasis** (e.g. leadership vs finance vs WFM lens) to reduce noise—**not** a substitute for access control. |

**Phase A acceptance themes:** Users in each role can complete primary jobs (monitor, ingest, correct, review accounts, operate requisitions, review finance/SLA/WFM) within their **assigned scope**; activity history reflects those actions.

---

### 4.2 Phase B — Operational cadence, risk signals, and personal workspace

*Bounded enhancements that strengthen **weekly discipline**, **proactive alerts**, and **individual follow-through**—implemented incrementally with agreed rules.*

| # | Workstream | Deliverables (what you get) |
| --- | ---------- | ---------------------------- |
| B1 | **Weekly client-manager discipline** | **Lightweight weekly attestation** per project (e.g. forecast refreshed, pipeline reviewed)—recorded as structured **activity** suitable for reporting and leadership review. |
| B2 | **Goal-risk notifications** | **Configurable rule-based alerts** (in-app first, **email** as agreed) for client managers when thresholds trip—e.g. forecast vs target band, SLA deterioration, **stale weekly attestation**. Rules start **narrow** and expand by agreement. |
| B3 | **Executive risk surfacing** | **Explicit “at risk” indicators** on project/client lists driven by **documented, configurable rules** (e.g. SLA pattern, ageing, finance attainment)—with **short, rule-based rationale** where a single dominant cause applies. |
| B4 | **Commercial exception lists** | **Exception views** for finance leakage signals (e.g. high **unbilled** relative to revenue—thresholds agreed with finance). |
| B5 | **Requisition intelligence** | **Saved views** and **simple threshold alerts** (e.g. open requisition count above agreed limit per project). |
| B6 | **Outcome vocabulary** | **Normalised outcome tags** for requisitions (e.g. joined, in pipeline, withdrawn/lost) mapped from existing status data—improving reporting consistency without duplicating master data. |
| B7 | **User profile & preferences (MVP)** | **Extended user profile**: contact details, timezone, **notification opt-in** flags—foundation for alerts and agendas. |
| B8 | **Personal agenda & tasks (MVP)** | **Task and due-item list** per user (e.g. weekly update due, follow-ups)—backed by a **minimal task model** or structured activity; **no** full enterprise project-management scope. |
| B9 | **Onboarding handover documents** | **Project-attached transition / ways-of-working documents** (e.g. PDF, Word) with **metadata** (title, version, effective date), **access rules** by role/project, and **activity log** entries on publish/update. **Excludes** collaborative editing, templates, and e-signature in this phase. |
| B10 | **Meetings — record & actions** | **Meeting record** (title, date, attendees, optional agenda link, status) and **action items** (description, owner, due date, optional project link); visibility on **personal agenda**; optional **email reminders** for actions. |
| B11 | **Meetings — async assistant support** | **Post-meeting**: paste notes or upload text; **assistant suggests action items** for **human confirmation** before saving—**no requirement** for live audio. |

**Phase B dependencies:** Agreed **thresholds**, **notification policy** (who receives what), and **data ownership** for attestations and documents.

---

### 4.3 Phase C — Roadmap (subject to prioritisation)

*Valuable capabilities that require **additional discovery**, **vendor choices**, or **broader identity design**. Not bundled as committed deliverables of Phase A or B without a separate statement of work.*

| # | Theme | Deliverable direction (to be specified in a future phase) |
| --- | ----- | ---------------------------------------------------------- |
| C1 | **Live meeting agent** | Real-time meeting **transcription** and **assistant** participation—subject to privacy, security, and platform selection. |
| C2 | **Richer nudging** | Digest emails, escalation paths, multi-step playbooks—still **rule-based** until predictive models are explicitly sponsored. |
| C3 | **Fine-grained roles** | Distinct policies for recruiter vs project manager vs client manager beyond the three baseline roles—implemented as **additional roles** or **capability flags** once stable. |
| C4 | **Cross-project candidate identity** | Dedicated **candidate** master if Taggd requires identity resolution across accounts. |
| C5 | **Agent-initiated actions** | Proactive briefings or **system writes** (tasks, emails) only with **explicit human approval** workflows. |
| C6 | **Enterprise identity** | Single sign-on, MFA, and directory integration at the **organisation’s** identity provider—often delivered with infrastructure, not only application configuration. |

---

## 5. Explicit exclusions (out of scope unless added by change request)

The following are **not** claimed as part of the core or near-term phases above unless separately agreed:

- Replacement of a full **HRIS**, **ATS**, or **invoicing / legal billing** system.  
- **Legal determination** of invoice correctness; the platform supports **operational reconciliation** and exception visibility.  
- **Autonomous** AI actions without human approval.  
- **Workforce optimisation** as an algorithmic planning engine—the product exposes **signals** (gaps, benchmarks, productivity fields), not optimised rosters.  
- **Collaborative document editing**, **templates**, and **e-signature** for transition documents in Phase B MVP.  
- **Global search** across all entities until specified and delivered.  

---

## 6. Assumptions & client dependencies

| Area | Assumption |
| ---- | ---------- |
| **Data supply** | Taggd continues to provide **timely** tracker and master files in agreed formats, plus named **data owners** per domain (delivery, finance, SLA, WFM). |
| **Governance** | A **product owner** (or equivalent) is available for **prioritisation**, **rule approval** (alerts, risk thresholds), and **UAT sign-off**. |
| **Change control** | Scope changes follow a **change request** process; roadmap items are **prioritised** rather than delivered all at once. |
| **AI assistant** | Use of the intelligence assistant depends on **approved organisational policy** for AI and **availability** of the chosen AI service; assistant remains **read-only** unless a future phase explicitly adds approved writes. |
| **Infrastructure** | Hosting, backup, and domain security are aligned with Taggd’s **IT and security standards** (may be documented in a separate runbook or deployment agreement). |

---

## 7. Delivery approach (industry practice)

| Activity | Purpose |
| -------- | ------- |
| **Kick-off & success criteria** | Align on objectives, roles, environments, and acceptance themes. |
| **Configuration & data onboarding** | Map accounts, pilot users, and initial master loads with stewards. |
| **Iterative UAT** | Role-based test scripts for Phase A; phased rollout of Phase B features with **pilot** client managers where applicable. |
| **Training & enablement** | Short role-based sessions (executive, client manager, finance, ops) plus quick-reference material. |
| **Hypercare** | Stabilisation window after go-live with agreed response expectations. |
| **Roadmap grooming** | Quarterly review of Phase C candidates against business value and risk. |

---

## 8. Suggested timeline (indicative)

*Final dates depend on resource availability, UAT cycles, and change requests.*

| Phase | Indicative duration | Notes |
| ----- | ------------------- | ----- |
| **Phase A — Core** | *Baseline product* | Treat as **available for rollout/UAT** subject to deployment and data readiness. |
| **Phase B — Cadence & workspace** | *To be agreed* (often **8–16 weeks** in slices) | Delivered as **incremental releases** (e.g. attestations → alerts → at-risk badges → documents → meetings). |
| **Phase C — Roadmap** | *Per initiative* | Separate scoping and commercials per item. |

---

## 9. Commercials

**Investment, payment milestones, and support fees** are **to be agreed** in a separate commercial schedule. This proposal defines **scope and deliverables** only.

---

## 10. Acceptance and next steps

1. **Confirm** phase boundaries (A / B / C) and any **must-have** items for first go-live.  
2. **Assign** product owner and data stewards.  
3. **Approve** Phase B **rules catalogue** (alerts, risk thresholds, attestation wording) before build.  
4. **Execute** statement of work / order form for **Phase B** slices as prioritised.  
5. **Schedule** kick-off and UAT plan.

---

## 11. Document alignment

This proposal is derived from the **Taggd Intelligence Platform — Control Center** product requirements (`PRODUCT_PRD.md`). The PRD remains the **detailed product reference**; this document is the **client-facing scope and deliverables** view.

---

*Confidential — intended for Taggd internal decision-making and authorised partners. Redistribution only with written consent.*
