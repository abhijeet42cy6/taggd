# Gap analysis: RevOps Part 2 plan vs current platform

**Source document:** `excel_files_imp/Taggd_RevOps_Part2_Plan.docx` (v1.0, March 2026)  
**Compared to:** Taggd Intelligence Platform / Control Center codebase (as of review date)  
**Purpose:** Module-by-module fit and a **rough magnitude** of remaining work—not a formal estimate in person-days.

---

## Summary verdict


| Category                                                  | Count (main modules §2–§20) | Notes                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Strong / good fit** (same job family, usable today)     | **6**                       | Dashboards, requisitions, ingestion, finance masters, SLA, WFM, activity log, weekly forecast & visibility, TAGGD billing grid                         |
| **Partial** (subset of fields/workflows; needs extension) | **8**                       | Monthly billing vs spec, “offer” story, ageing, PH forecast template, reports export, CEO view, performers, AI analysis, roles                         |
| **Missing or not started** (net-new product surface)      | **6+**                      | MoM, governance tracker, finance validation workflow, vendor module, daily sourcing, customer portal, reminder engine, weekly AI report, HubSpot, etc. |


**Order-of-magnitude:** Delivering the Word document **as written** implies on the order of **30–45** distinct product initiatives (epics/features) if broken down by module + integrations + notifications—many of which are **large** (portal, HubSpot, full validation UI, supply-chain module).

**Already aligned in spirit (not identical to every field):** Central monitoring, Excel ingestion, requisition operations, finance/cashflow views, SLA/WFM analytics, data-quality queues, read-only AI chat (implementation uses **Gemini**, not **Claude** as in the doc), role-based access with **admin / executive / manager** (doc assumes a **richer role matrix**).

---

## Section-by-section comparison

### 1. Executive summary (doc §1)


| Doc intent                                     | Current product                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unify RevOps, finance, partners, analytics, AI | **Largely yes** for core RevOps + finance + SLA + WFM + AI assist; **no** partner supply chain, **no** customer portal, **limited** automated AI operations. |


---

### 2. Minutes of Meeting (MoM) module (§2)


| Fit                                                                   | **Missing**                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Structured MoM, rich text, action items, attachments, status workflow | No dedicated MoM entity/UI. **PRD** mentions phased meeting + actions as future. |


**Gap:** Net-new module (data model + UI + optional file storage + links to projects).

---

### 3. Customer governance meeting tracker (§3)


| Fit                                                                    | **Missing**                           |
| ---------------------------------------------------------------------- | ------------------------------------- |
| Cadence, scheduled vs actual, feedback score, escalations, link to MoM | Not present as a first-class tracker. |


**Gap:** Net-new module (or extend MoM with governance subtype).

---

### 4. Project sign-up / renewal details (§4)


| Fit                                                                                   | **Partial**                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer, project name, PH, contract dates, pricing model, SOW upload, renewal status | **Projects** carry directory-style metadata (account, charge code, heads, practice, sheets, logic). **Not** a full commercial lifecycle: renewal countdown, contract type enum, estimated annual value, internal/client sign-off fields, amendment history. |


**Gap:** Medium—extend `projects` (or child **contract** table) + UI wizard + document attach per contract.

---

### 5. Monthly customer billing tracker (§5)


| Fit                                                                                                                                              | **Partial**                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Month, PH, project, opening balance, booked, MMF, advances, adjustments, bad debt, closing, invoiced, collected, DSO, ageing bucket, PH sign-off | **Two parallel lanes:** (1) **Finance master** (`finance_monthly_ledger`, `finance_cash_flow`) for revenue/CM/collections/unbilled/bad debt at month grain. (2) **TAGGD revenue billing** (`taggd_revenue_billing` + **Billing** UI) with booked/MMf/joiners/fees, invoice and collection dates/amounts, approver, notes—**closer** to ops billing but **not** every column (e.g. opening balance roll-forward, DSO auto-calc, ageing bucket tags, formal PH sign-off checkbox workflow). |


**Gap:** Medium–large—field parity, roll-forward logic, DSO/ageing automation, optional approval step.

---

### 6. Finance validation & approval interface (§6)


| Fit                                                                                                                                        | **Partial / weak**                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation states, discrepancy notes, invoice lifecycle, partial payment, TDS, GST recon, two-level approval, audit on financial approvals | Ledger/billing rows can be edited; **activity** logs some actions. **No** dedicated validation queue, **no** TDS/GST/partial-payment model, **no** configurable approval matrix. |


**Gap:** Large—workflow engine + invoice/payment sub-ledger + finance reviewer roles.

---

### 7. Resume supply chain partner management (§7)


| Fit                                                           | **Missing**     |
| ------------------------------------------------------------- | --------------- |
| Vendor contracts, credits, utilization, ROI, restricted roles | Not in product. |


**Gap:** Net-new restricted module + RBAC for C-suite roles as per doc.

---

### 8. Recruiter daily sourcing report (§8)


| Fit                                                                                               | **Missing**                                                                      |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Daily per-recruiter per-req metrics (sourced, screened, submitted, interviews, rejections, hours) | Not present. `records` / requisitions do not replace daily sourcing granularity. |


**Gap:** Net-new module (high row volume; consider mobile-friendly capture).

---

### 9. Project-wise offer tracker (§9)


| Fit                                                                                          | **Partial**                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated offer ID, offer status machine, billing trigger, replacement guarantee, masked PII | **Requisition `Record`** carries candidate, dates, CTC, status, `revenue_results`, `global_status`—**overlaps** with offer/join story but **not** a separate **Offer** entity or full field set from §9. |


**Gap:** Medium—either extend records with structured offer fields or add **offers** table linked to `records`.

---

### 10. PH weekly revenue forecast template (§10)


| Fit                                                                                                                                     | **Partial**                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed / high / med / low probability bands, weighted forecast formula, expected joinings/offers, revenue at risk, forecast accuracy | `**RevenueForecastWeekly`** + UI: weekly lines with **fee breakdown** (MMF, open, joiner, to-be-offer, etc.) and counts—**TAGGD operational** model. Doc’s **probability-weighted** columns and **trailing accuracy %** are **not** the same shape. |


**Gap:** Medium—add optional columns or second “leadership template” view + reporting.

---

### 11. Ageing-wise status tracker (§11)


| Fit                                                                                          | **Partial**                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified requisition / offer / invoice ageing with SBU/BU, buckets 0–15…90+, escalation flags | **Executive monitor** exposes **requisition ageing** buckets for open pipeline. **No** single module combining **offer** and **invoice** ageing; **SBU/BU** not first-class filters unless mapped onto existing project metadata. |


**Gap:** Medium—unified ageing fact table or views + BU dimension.

---

### 12. Project report download module (§12)


| Fit                                                              | **Partial**                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Configurable PDF/Excel/PPT, scheduled email, all sections in §12 | **Export** affordances exist on some screens; **no** packaged **project pack** generator, **no** scheduler, **no** PowerPoint pipeline. |


**Gap:** Large if spec is fully met; **small MVP** = one **Excel/PDF** export bundling existing APIs.

---

### 13. Integrations — Claude AI & HubSpot (§13)


| Fit                                       | **Partial**                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Claude everywhere; HubSpot bi-directional | **Agent** is **read-only Q&A** over data (typically **Gemini**, not Claude). **No HubSpot**. |


**Gap:** Integrations are **separate projects** (auth, sync, field mapping, conflict rules).

---

### 14. Real-time customer access portal (§14)


| Fit                                                              | **Missing**                         |
| ---------------------------------------------------------------- | ----------------------------------- |
| Customer login, read-only dashboards, escalation, messaging, NPS | Not in product (internal-only app). |


**Gap:** Very large—identity for customers, separate UI, data redaction, legal/commercial alignment.

---

### 15. KPI dashboards for practice heads & leaders (§15)


| Fit                                                                        | **Partial**                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personalized landing KPIs, targets per PH, governance-derived satisfaction | **Dashboard** + **Finance** + **SLA** + **WFM** + **Portfolio** give **shared** KPIs with filters. **Not** personalized per PH landing with **stored targets** for every KPI in §15; governance satisfaction **N/A** without §3. |


**Gap:** Medium—saved views, target tables, PH default scope.

---

### 16. Founder & CEO consolidated KPI view (§16)


| Fit                                  | **Partial**                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single screen with all widgets §16.1 | **Executive Overview** covers **many** themes (revenue, pipeline, finance, SLA, WFM, drilldowns). **Missing** as first-class UI: vendor spend pie, renewal calendar from §4, customer satisfaction trend from governance, some **AI insight cards** as automated jobs. |


**Gap:** Medium—mostly **composition** of existing data + a few new feeds.

---

### 17. Top & bottom performers (§17)


| Fit                                                                 | **Partial**                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rank recruiters/managers/PH with composite score, quarterly toggles | **Portfolio** composite by **project**; drilldowns by hiring manager. **No** formal **performer** module, **no** recruiter-level rankings tied to joins/sourcing velocity from §8. |


**Gap:** Medium—needs consistent **person-level** facts (joins attributed to recruiter user id).

---

### 18. AI-powered auto analysis engine (§18)


| Fit                                                                  | **Partial**                                                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Continuous anomaly detection, churn prediction, scheduled narratives | **On-demand Agent** only. **No** scheduled scans, **no** push anomaly cards (except manual interpretation of Data Ops). |


**Gap:** Large if fully automated; **small MVP** = scheduled jobs with **rule-based** flags + optional LLM summary.

---

### 19. Auto reminders & triggers (§19)


| Fit                                                 | **Missing**                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email + Slack, 12+ trigger types, escalation matrix | **No** notification service in scope of current app (per **PRD**, email nudges are **near-term**). |


**Gap:** Large cross-cutting—trigger definitions, templates, channels, idempotency.

---

### 20. AI-generated weekly report for leadership (§20)


| Fit                        | **Missing**      |
| -------------------------- | ---------------- |
| Monday PDF + email archive | Not implemented. |


**Gap:** Medium if built on top of existing metrics + one LLM pass + mailer.

---

### 21. Recommended additional modules (§21)


| Fit                                                                                                               | **Missing**                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| NPS, capacity planner, competitive intel, compliance, client health score, margin tracker, L&D, SLA config engine | **Not** in current product (SLA **ingestion** exists; **central SLA config engine** does not). |


**Gap:** Each item is a **separate** initiative.

---

### 22–24. Data architecture, RACI, roadmap (doc §22–§24)


| Fit                                        | **Partial**                                                                                                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity map, integrations list, role matrix | **Implementation** uses **Project → Record**-centric model + finance/SLA/WFM satellites—not the full **Candidate / Offer / Invoice** normalization in the doc. **Roles** = 3; doc matrix implies **10+** actor types. |


**Gap:** Conceptual—align data model when building §4–§12; expand RBAC when building portal and finance validation.

---

## How many “changes” in plain language

Interpretation depends on granularity:


| Granularity                                                                    | Approximate count |
| ------------------------------------------------------------------------------ | ----------------- |
| **Major modules** net-new or major rewrite                                     | **12–16**         |
| **Significant extensions** to existing surfaces                                | **8–12**          |
| **Integrations / platform** (HubSpot, calendar, Slack, email, ATS, accounting) | **6–10** tracks   |
| **Cross-cutting** (notifications, richer RBAC, customer auth)                  | **3–5** tracks    |


**Total epic-level items:** **~30–45** to mirror the Word spec; **not** counting bugfixes or UX polish.

**Pragmatic path:** Use the doc’s own phased roadmap (§24) but **replace** “Claude” with your **actual** AI provider and **insert** **customer portal** and **integrations** only when sponsored—otherwise scope explodes.

---

## Quick reference: current strengths vs doc

**Already strong vs doc themes**

- Central **monitoring** and **logging** (dashboards + activity + ingestion).  
- **Requisitions** at scale with CRUD and pipeline KPIs.  
- **Finance** and **cash** signals (masters + UI + unbilled/bad debt where data exists).  
- **SLA** and **WFM** analytics + uploads.  
- **Weekly** revenue **forecast** and **visibility** snapshots (TAGGD shape).  
- **Billing** grid (`taggd_revenue_billing`) with invoice/collection fields.  
- **Data operations** / integrity queues.  
- **Read-only AI** assistant for exploratory questions.

**Largest gaps vs doc**

- **Customer-facing portal**  
- **MoM + governance** suite  
- **Finance validation / invoice** workflow depth  
- **Supply chain partner** module  
- **Daily sourcing** + **dedicated offer** model  
- **Reminder / Slack / email** automation  
- **HubSpot** and **Claude-specific** integration narrative  
- **Automated** weekly leadership report and **continuous** AI analysis

---

*This analysis is based on document text extracted from the `.docx` and repository structure; minor UI features may exist without being listed here.*