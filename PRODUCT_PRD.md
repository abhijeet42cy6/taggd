# Product Requirements Document (PRD)

## Taggd Intelligence Platform — Control Center

**Document type:** Product specification — features, users, goals, and usage  
**Audience:** Product, leadership, customer success, design, engineering (context)  
**Scope:** Web application in this repository (operations intelligence for RPO / hiring revenue operations)  
**Last updated:** April 2, 2026  

**Capability labels used in this document**


| Label         | Meaning                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Shipped**   | Available in the product today (may still mature).                                                                                      |
| **Near-term** | Bounded, incremental work—typically rules, notifications, fields, or a focused UI flow on existing data.                                |
| **Roadmap**   | Valuable target; requires a defined phase—often integrations, new services, or research (not implied as complete in the current build). |


---

## 1. What this product is

**Taggd Intelligence Platform (Control Center)** is the **central monitoring and logging hub** for **Taggd’s operations**: a **web-based command center** where **executives and leadership** keep a continuous view of **how the organisation is performing**, while **operational roles** (recruiters, client managers, project managers, commercial, onboarding, and platform teams) **feed and maintain** forecasts, targets, trackers, and master data so that picture stays current and auditable.

It brings together **hiring pipeline (requisitions)**, **revenue and fee recognition (trackers + logic)**, **client SLA performance**, **workforce benchmarks and gaps**, and **finance outcomes** (budget, actual, contribution margin, collections, **unbilled**, **bad debt**)—so teams are not reconciling dozens of disconnected spreadsheets to answer basic questions.

It is built around **Excel-first workflows** Taggd already uses (trackers, finance/SLA/WFM masters, directory metadata) and **extends** them into a **shared, policy-aware system** with dashboards, drill-downs, quality checks, **activity and ingestion logging**, and optional **AI-assisted read-only analysis**.

---

## 2. Mission: monitoring, logging, and operational truth

### 2.1 Central monitoring

The platform exists so **no critical operational signal lives only in someone’s inbox or personal file**:

- **Portfolio health** — requisition volume, lifecycle mix, ageing, revenue/fees from tracker logic, finance attainment, SLA compliance, WFM stress.  
- **Account and project lens** — same metrics **scoped** to a client / project for client managers and delivery leads.  
- **Risk surfacing** — anomalies and integrity issues (e.g. closed reqs with no revenue, missing joins, split identities) are **visible and queueable** for remediation—not only visible after a monthly close.

### 2.2 Central logging

**Logging** is not an afterthought: the product records **who did what, when**, across ingestion, material edits, and many platform actions—so Taggd can **audit**, **onboard new staff**, and **explain numbers** to clients or finance without reconstructing history from chat threads.

**Shipped:** unified **Activity log**, ingestion-oriented events, and server-side enforcement of access so logs remain meaningful (only actions the user was allowed to perform).

---

## 3. How the organisation uses the platform

### 3.1 Executives and leadership

**Goal:** See **how the org is performing**, **where risk is**, and **what to do next**—without manual consolidation.

They use the platform to:

- Monitor **project / account performance** (pipeline, revenue, SLA, WFM, finance) in one place.  
- Spot **projects at risk** using **composite health signals**, explicit **data-quality queues**, and **failing or weak KPIs** (e.g. SLA “not met”, finance variance, open-pipeline ageing).  
- Understand **underperformance** in context: which **account**, which **metric family** (hiring vs SLA vs finance vs capacity), and **evidence rows** where applicable.  
- Assess **capacity / understaffing proxies** via **WFM benchmarks**, resource-gap data, and productivity-style finance fields **where populated**—not as a full HRIS replacement.  
- Use the **Agent** (**Shipped**, read-only) to ask **natural-language questions** over **live** metrics and definitions already in the system—suitable for **guided analysis**, not autonomous decisions.

**Near-term (easy to specify):** saved **executive views** (filter presets), **pinned “at-risk” lists** driven by simple thresholds on existing aggregates, and **short rationale strings** on why a project appears on a risk list (rule-based, not black-box).

### 3.2 Client managers, project managers, recruiters, and commercial

**Goal:** **Input and maintain** the operational and commercial picture for **their** accounts—**forecasts**, **targets**, **weekly discipline**, and **how client relationships and delivery are progressing**—within **policy** (what they may see and edit).

They use the platform to:

- Enter or refresh **weekly revenue forecast** and **visibility** lines (**Shipped** — revenue trackers).  
- Maintain **requisitions**—**create, update, delete** where permitted—and keep **status** and dates aligned with reality so **downstream KPIs** stay honest.  
- Rely on **ingestion** for bulk updates from Excel when that is faster than row-by-row UI work.  
- Contribute to **finance and planning** through finance master uploads and, where enabled, **manual ledger corrections** for stewards.

**Near-term (implementable):**  

- **Weekly update obligation** for client managers: a **lightweight checklist or attestation** (“forecast updated”, “pipeline reviewed”) tied to **project + week**, stored as structured events in the **activity** model—**no** heavy project-management product required.  
- **Goal-risk notifications** to client managers: **email** (or in-app first, email second) when **simple rules** fire—e.g. forecast vs target band, SLA deterioration, or **stale weekly update**—using **existing** KPIs and timestamps. Rules should start **narrow** (one or two thresholds) and expand.

**Roadmap:** richer **nudging** (digest emails, escalation paths)—still rule-based before any ML.

### 3.3 Finance, onboarding, WFM, and platform ops

- **Finance:** billing alignment, **unbilled**, **bad debt**, collections vs target (**Shipped** in finance surfaces where data exists).  
- **WFM:** benchmarks and gaps (**Shipped** via masters + UI).  
- **Onboarding:** **Near-term / Roadmap**—see **§6.9** (transition document)—implemented first as **controlled document storage + permissions** on a project, not a full DMS.  
- **Platform ops:** ingestion, **Data Operations**, metadata fixes (**Shipped**).

---

## 4. User policy, profiles, and differentiated experience

Every user should experience the product according to **policy**: **which data is visible**, **which operations are allowed**, and **what they are expected to do on a cadence** (e.g. weekly updates).

### 4.1 What “policy” means in the product


| Layer                                                     | Intent                                                                     | Status                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Authentication**                                        | Known user, secure session                                                 | **Shipped**                                                                                       |
| **Role** (admin / executive / manager)                    | Baseline permissions                                                       | **Shipped**                                                                                       |
| **Project scope**                                         | Managers (and optionally scoped executives) see **only assigned** projects | **Shipped**                                                                                       |
| **Persona / emphasis** (UI)                               | Navigation emphasis for CEO vs Finance vs WFM, etc.                        | **Shipped** (emphasis only; **not** a security boundary)                                          |
| **Per-user profile**                                      | Name, contact, timezone, notification preferences                          | **Roadmap** — start with **email on user record** + **opt-in flags** (small schema change).       |
| **Per-user agenda**                                       | Tasks, due items, “your weekly update due”                                 | **Near-term** — backed by **activity + due_date** or a minimal **tasks** table; avoid full Gantt. |
| **Fine-grained permissions** (e.g. recruiter vs PM vs CM) | Separate **policies** beyond the three roles                               | **Roadmap** — phase as **additional roles** or **capability flags** once requirements stabilize.  |


### 4.2 Principle

**All visibility and mutations are enforced on the server**; the UI only reflects policy. Expanding profiles and agendas must **not** weaken that rule.

---

## 5. Executive command: performance, risk, KPIs, and agent-assisted analysis

### 5.1 Project performance and risk

**Shipped foundations:** Executive Overview, Portfolio Intelligence, Clients, Data Operations, Finance Command, SLA, WFM, requisition KPIs, and integrity lists give executives:

- **Which projects lag** on fill, hold-heavy pipelines, revenue per position, finance variance, or SLA failure rates—via **existing** charts, tables, and quality queues.  
- **Actionable next steps** that stay honest: open **evidence** lists, go to **client cockpit**, drill **requisitions**, or push **recalculate / metadata** fixes—rather than claiming automated remediation.

**Near-term:** explicit **“At risk”** badges on project lists when **documented rules** pass (e.g. SLA not-met rate, ageing bucket, finance attainment below X%)—implemented as **configuration** over existing aggregates.

### 5.2 Failing KPIs and “why”

**Shipped:** SLA detail and time series show **which metrics** miss; finance variance shows **which months / accounts** diverge; Data Operations shows **which rows** violate integrity.  

**Near-term:** one-line **“primary reason”** on risk cards when a **single dominant rule** triggers (e.g. “SLA: 3 consecutive months not met”); avoid synthetic narratives until data supports them.

### 5.3 Understaffing and capacity

**Shipped:** WFM benchmarks and resource gaps; finance efficiency fields where ingested.  

**Clarification:** The product surfaces **signals**, not workforce planning **optimisation**. Any “understaffed” language in UI should map to **measurable fields** (e.g. gap rows, HC vs target).

### 5.4 Agent for executives

**Shipped:** Read-only **Agent** answers questions against **live** structured data via tools—good for **exploration** (“Which accounts had the most SLA misses last quarter?”) when queries map to existing APIs.

**Roadmap:** **proactive** agent briefings or **write** actions (tasks, emails)—only after **human approval** flows are defined.

---

## 6. Requisitions, pipeline intelligence, and candidate history

### 6.1 Requisitions (all stakeholders with access)

**Shipped:** Portfolio **requisition** views with **search, filter, pagination**, and **create / edit / delete** subject to policy; **pipeline KPIs** (open, offer-stage, joiners, totals) at portfolio level.

**Intelligence (Shipped + Near-term):**  

- **Shipped:** drilldowns, per-project stats, dashboard aggregates.  
- **Near-term:** saved **views** and **simple alerts** when counts cross thresholds (e.g. open reqs above N for a project).

### 6.2 Candidate / position history for future reference

The system should support **continuity**: who **joined**, who was **in play** (active / offered / pipeline), and who **left or closed without join**—for **handoffs**, **client reviews**, and **avoiding duplicate mistakes**.

**Shipped:** Requisition **records** retain **status**, **dates**, **fees/revenue results**, **global lifecycle status**, and **flexible attributes** from trackers—suitable as the **system of record** for historical pipeline rows as long as ingestion and edits stay disciplined.  

**Near-term:** explicit **outcome tags** (e.g. **Joined**, **Prospected / in pipeline**, **Withdrawn / lost**) mapped from **existing** status fields or a **small controlled vocabulary**—implemented as **normalisation rules**, not a parallel database of people.  

**Roadmap:** dedicated **candidate entity** if Taggd needs cross-project candidate identity—larger design.

---

## 7. Commercial integrity: billing, unbilled, and bad debt

**Shipped (where finance masters are loaded):** Finance Command and portfolio finance stats expose **actual vs budget**, **contribution margin**, **collections**, **collection targets**, **unbilled**, and **bad debt**—so users can ask whether **clients are billed correctly** in the sense of **“do our books and trackers align with what we expect to collect and recognise?”**

**Clarification:** “Billed correctly” is **operational reconciliation** (ledger + cashflow signals), not automated legal invoicing validation.

**Near-term:** **exception lists**—e.g. projects where **unbilled / revenue** ratio exceeds a threshold—using **existing** monthly rows.

---

## 8. Internal meetings, actions, and the Agent (phased)

**User need:** Internal Taggd meetings should produce **clear ownership** and **tracked follow-ups**, and eventually **lighter load** on note-takers.

### 8.1 Phased approach (implementable promises)


| Phase                         | What we deliver                                                                                                                                           | Effort band  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **A — Meeting record**        | Create a **meeting** object: title, date, attendees (user ids), **optional link** to agenda doc URL, **status**.                                          | Small        |
| **B — Actions from meetings** | **Action items**: text, owner user, due date, link to `project_id` optional; list on **profile / agenda** view; reminders via **email** optional.         | Small–medium |
| **C — Agent assist (async)**  | After meeting, paste **notes** or upload **text**; Agent proposes **action items** for **human confirm** before save—**no** live audio requirement.       | Medium       |
| **D — Live meeting Agent**    | Real-time **transcription + agent** in call: **Roadmap** / vendor-dependent; **not** a near-term commitment without speech pipeline and privacy sign-off. | Large        |


This ordering keeps **promises easy to implement**: **A + B** deliver most operational value; **C** adds intelligence without hardware integration; **D** stays explicitly **future**.

---

## 9. Client onboarding: transition document to recruiters

**Need:** Onboarding (with the **client**) produces a **transition / ways-of-working document** so **recruiters** adopt **client-specific** process, tone, and SLAs.

**Near-term (MVP):**  

- **Attach** one or more **files** (PDF/DOCX) to a **project** with **metadata** (title, version, effective date).  
- **ACL:** roles **recruiter / PM / CM** (once defined) or existing **manager** scope can **view** documents for projects they own.  
- **Activity log** entry on publish/update.

**Roadmap:** **Collaborative editing**, templates, and **e-sign**—out of scope for first slice.

---

## 10. What it is used for today (summary table)


| Use case                | Who benefits              | What they do in the product                                                                |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| **Org-wide monitoring** | Executives                | Executive Overview, Portfolio Intel, finance/SLA/WFM summaries, Data Operations, Agent Q&A |
| **Account oversight**   | Client / project managers | Clients, client detail, scoped requisitions and trackers                                   |
| **Operational input**   | Recruiters, PMs, CMs      | Requisitions CRUD, weekly revenue trackers, uploads                                        |
| **Finance & risk**      | Finance, leadership       | Finance Command, unbilled/bad debt/collections views                                       |
| **SLA / WFM**           | Account mgmt, WFM         | SLA and WFM surfaces + uploads                                                             |
| **Quality & logging**   | Platform ops              | Ingestion Center, Data Operations, Activity log                                            |
| **Administration**      | Admins                    | Users & access                                                                             |


---

## 11. What it will be used for (direction)

- **Tighter cadence:** Weekly client-manager **updates** and **goal-risk nudges** (Near-term).  
- **Richer personal workspaces:** **Profile + agenda + tasks** tied to policy (Near-term → Roadmap).  
- **Meeting outcomes:** **Action tracking** first; **async Agent** on notes second; **live meeting** capabilities only as a **later** phase (**§8**).  
- **Onboarding continuity:** **Transition documents** on project with clear visibility rules (**§9**).  
- **Deeper intelligence:** More **rule-based** risk and exception lists before any **predictive** claims.

---

## 12. Users and roles (reference)

### 12.1 Primary user groups


| User group                         | Needs                                               | How the product serves them                                                   |
| ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Executive / leadership**         | Portfolio pulse, risk, KPI failures                 | Dashboards, quality queues, finance/SLA/WFM, Agent (read-only)                |
| **Regional / practice leadership** | Rollups and filters                                 | Same surfaces + filters; optional project scope                               |
| **Client / delivery managers**     | Account health, forecasts, weekly cadence           | Clients, requisitions, revenue trackers; **Near-term:** attestations + nudges |
| **Recruiters / coordinators**      | Req hygiene, client context                         | Requisitions; **Near-term:** transition docs on project                       |
| **Finance & commercial**           | Budget, actual, CM, collections, unbilled, bad debt | Finance Command, uploads                                                      |
| **WFM / HR analytics**             | Capacity signals                                    | WFM                                                                           |
| **Onboarding**                     | Handover artefacts                                  | **Near-term:** document attach + ACL (**§9**)                                 |
| **Platform / data stewards**       | Ingestion, integrity                                | Ingestion Center, Data Operations                                             |
| **Administrators**                 | Users & policy                                      | Admin UI                                                                      |


### 12.2 Roles (access control)


| Role          | In practice                                     |
| ------------- | ----------------------------------------------- |
| **Admin**     | Full access; user and assignment management     |
| **Executive** | Org-wide unless restricted to assigned projects |
| **Manager**   | Assigned projects only                          |


---

## 13. Product goals (concise)


| Goal                          | Success looks like                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| **Single operational hub**    | Monitoring + logging + inputs in one authenticated place                            |
| **Policy-correct experience** | Each user sees and edits only what policy allows                                    |
| **Proactive operations**      | Near-term: **timely nudges** and **weekly discipline** without spreadsheet policing |
| **Trust in numbers**          | Data Operations + ingestion feedback; finance and tracker coherence understood      |
| **Auditability**              | Activity and ingestion history support reviews                                      |


---

## 14. Feature catalog (by outcome)

### 14.1 Executive visibility

**Shipped:** Executive Overview, **CEO's View** (`/ceo-view`; Operational Pulse uses **Taggd joiner sheet cohort** — see **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §9), Portfolio Intelligence, filters (incl. Indian FY), YoY/regional charts, composite health helpers, drilldowns.

### 14.2 Client and delivery operations

**Shipped:** Clients hub, client detail, requisitions grid with CRUD (policy-bound), pipeline KPIs.

### 14.3 Finance and commercial

**Shipped:** Finance Command, manual ledger upserts (where enabled), revenue trackers, budget/forecast upload paths, unbilled/bad debt/collections **when data exists**.

### 14.4 SLA and workforce

**Shipped:** SLA Performance (stats, detail, time series, uploads), WFM benchmarks and gaps (uploads + UI).

### 14.5 Data quality and platform operations

**Shipped:** Data Operations, Ingestion Center (Express/Pro + masters), Activity log.

### 14.6 Intelligence and administration

**Shipped:** Read-only Agent; admin user and project assignment management.

### 14.7 Notifications and cadence (**Near-term**)

Email or in-app alerts for **client managers** when **documented rules** indicate goal risk or **stale weekly inputs**; **weekly attestation** for forecast/review.

### 14.8 Meetings and tasks (**Near-term → Roadmap**)

Meeting record + **action items** + optional **async** Agent on pasted notes (**§8**). Live meeting Agent = **Roadmap**.

### 14.9 Onboarding artefacts (**Near-term**)

Project-attached **transition documents** with permissions (**§9**).

---

## 15. Where to work in the app (information map)


| Area               | Route                            | Primary jobs-to-be-done       |
| ------------------ | -------------------------------- | ----------------------------- |
| Executive Overview | `/`                              | Org monitoring, charts        |
| Portfolio Intel    | `/portfolio`                     | Compare accounts              |
| Clients            | `/clients`, `/clients/:clientId` | Account cockpit               |
| Requisitions       | `/requisitions`                  | Req operations + intelligence |
| Finance Command    | `/finance`                       | Money, unbilled, bad debt     |
| Revenue trackers   | `/revenue-trackers`              | Weekly forecast & visibility  |
| SLA Performance    | `/sla-performance`               | Contract SLA                  |
| Workforce Mgmt     | `/wfm`                           | Capacity signals              |
| Data Operations    | `/data-operations`               | Risk & integrity              |
| Ingestion Center   | `/ingestion`                     | All uploads                   |
| Activity log       | `/activity`                      | Audit narrative               |
| Agent              | `/agent`                         | Read-only analysis            |
| Users & access     | `/admin/users`                   | Provisioning                  |


---

## 16. Key assumptions

- Excel remains a **primary input**; the platform is the **system of record after ingestion**.  
- Indian FY and INR presentation remain first-class.  
- **Tracker revenue** and **finance master** can differ; users must know which view answers which question.

---

## 17. Non-goals (unless explicitly moved to roadmap)

- **Not** a full HRIS, ATS replacement, or invoicing system.  
- **Not** autonomous Agent actions without human approval.  
- **Live meeting listening Agent** — **not** a current commitment (**§8**).  
- **SSO/MFA** — not required in base repo spec (may be added at deploy layer).

---

## 18. Appendix — Technical reference

See `DATABASE_SCHEMA.md`, `DEPLOYMENT_DOC.md`, and engineering docs for APIs, schema, and deployment.

*This PRD balances **aspiration** with **phasing**: items marked **Near-term** and **Roadmap** are intentional product targets, not claims that every slice is already built.*