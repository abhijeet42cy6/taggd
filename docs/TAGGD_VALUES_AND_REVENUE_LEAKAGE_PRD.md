# Taggd company values (login) & Revenue Leakage tab — product requirements

This document captures the requested product and analytics behavior. It is intended for engineering, design, and data stakeholders. **No implementation is described at the code level**; it specifies what to build and how success should be measured conceptually.

---

## 1. Executive summary

Two capabilities are requested:

1. **Post-login values experience** — On successful login, show a modal (popup) that communicates Taggd’s **purpose**, **mission**, and **vision** using the exact copy provided below.
2. **New navigation tab: “Revenue Leakage”** — A dedicated area for **position tracking** and analytics focused on **cancelled requisitions** within a month, **revenue leakage** and **revenue ageing**, and a **source of hire** lens that classifies financial impact (benefit vs loss) by category.

The Revenue Leakage tab should align visually and structurally with existing “sectioned form” patterns in the app (e.g. titled blocks with subtitle, label/value rows, date pickers in a two-column row, optional JSON or structured fields where appropriate).

---

## 2. Login popup — Taggd company values

### 2.1 Trigger

- **When:** Immediately after a successful authentication (login), before or as the user lands on their default home/workspace view.
- **Frequency (recommended default):** Show once per session, or once per day per user — **product should confirm** (see §7). The requirement text implies a popup “on login”; the exact repeat policy should be explicit to avoid fatigue.

### 2.2 Presentation

- **Format:** Modal dialog (centered overlay) or equivalent accessible pattern (focus trap, Esc to dismiss, clear primary dismiss control).
- **Branding:** Consistent with Taggd / platform styling (accent color, typography). Content is message-first; avoid clutter.

### 2.3 Copy (exact)

Use the following structure and wording.

**PURPOSE**

> Create Success for  
> Each Hiring Manager.

**MISSION**

> Power Recruiters of Tomorrow.  
> With our ATF (AI Talent Fulfillment) platform that delivers  
> exceptional experience to hiring managers, and candidates

**VISION**

> Fulfill 1 Million Jobs  
> by 2030

### 2.4 Interaction

- User must be able to **close** the modal and proceed to the app.
- Optional: “Don’t show again” (if product allows) — not specified in the request; treat as optional enhancement.

### 2.5 Accessibility & localization

- Headings should be exposed to assistive technologies (e.g. semantic heading levels or `aria-labelledby`).
- If the product supports multiple languages later, this copy is the canonical English source.

---

## 3. New tab: “Revenue Leakage”

### 3.1 Placement

- Add a **new primary navigation tab** labeled **“Revenue Leakage”** (exact label as requested).
- It should sit alongside existing workspace tabs/routes in a way consistent with the current information architecture (exact position is a UX decision; typically grouped with workforce / revenue / analytics modules).

### 3.2 Purpose of the tab

Provide visibility into **revenue leakage** tied to recruitment operations, with emphasis on:

- **Cancelled requisitions** in a selected **month** (the core population for “position tracker” style reporting).
- **Revenue ageing** derived from timestamps on the requisition and candidate pipeline.
- **Source of hire** as a **commercial lens**: some sources are framed as **beneficial** (higher revenue / better economics), others as **loss** relative to that benchmark.

---

## 4. Definitions

### 4.1 Position tracker (scope)

- **Meaning:** A tracker oriented around **positions / requisitions** (not just abstract revenue rows), listing or aggregating items that qualify for the Revenue Leakage logic.
- **Monthly cohort:** For a chosen calendar month, include requisitions that meet the **cancellation** and **inclusion rules** (see §5).

### 4.2 Cancelled requisitions (numerator population)

- **Rule (as stated):** “All the **cancelled requisitions** for **that month**” are considered for calculation.
- **Clarifications needed for implementation** (see §7):
  - Does “for that month” mean **cancellation date** falls in the month, **requisition created** in the month, or **both** available as filters?
  - Definition of **cancelled** in data (status codes, workflow states, who can cancel).

### 4.3 Revenue leakage (conceptual)

- In this PRD, **revenue leakage** is used in two related senses:
  1. **Operational / SLA leakage:** Failure to share the first CV within a **48-hour** window (excluding non–office days) from requisition creation — i.e. speed-to-first-CV underperforms policy.
  2. **Commercial leakage via source mix:** Non-RPO sources are treated as **less revenue** than RPO; therefore mix shifts show up as “loss” relative to the beneficial category.

Product and finance should confirm whether “revenue leakage” will be **quantified in currency** (requires fee tables, contract terms) or **primarily as operational and categorical exposure** until billing integration exists.

### 4.4 Revenue ageing (metric)

- **Primary definition (stated):**  
**Revenue ageing = First CV Shared Date − Req Assigned Date**  
(typically expressed in **days**, and summarized as **average** and **distribution by bucket**.)
- **Interpretation:** Measures how long after **assignment** the first CV was shared — a pipeline speed metric at the requisition level.

### 4.5 First CV within 48 hours (SLA-style check)

**Example given:**

- **1 April** — requisition **creation**
- **5 April** — **first CV** shared  
- Evaluate whether the first CV falls **within 48 hours** of **requisition creation**, **excluding non–office days** (weekends/holidays per org calendar).

**Important distinction:** The ageing metric uses **Req Assigned date** in the numerator’s definition, while the 48-hour rule is described relative to **req creation**. These are **two different anchors**. Implementation must preserve both:


| Concept            | Anchor A                   | Anchor B                  | Rule                                                       |
| ------------------ | -------------------------- | ------------------------- | ---------------------------------------------------------- |
| **48h first CV**   | Req **creation** date/time | First CV shared date/time | Within 48 **working** hours (exclude non–office days)      |
| **Revenue ageing** | Req **assigned** date      | First CV shared date      | Calendar or business-day difference — **confirm** (see §7) |


---

## 5. Metrics & calculations (specification)

### 5.1 Average ageing

- **Per requisition (where dates exist):**  
`ageing_days = First_CV_Shared_Date - Req_Assigned_Date`
- **Aggregate:** **Average** of `ageing_days` over the filtered set (cancelled reqs in month, subject to valid dates).
- **Missing data:** Rows with null **Req Assigned** or **First CV Shared** should be excluded from average or shown in a **“incomplete data”** segment — policy to be confirmed.

### 5.2 Ageing buckets (distribution)

Report the count (and optionally percentage) of requisitions in each bucket:


| Bucket   | Range (days) |
| -------- | ------------ |
| Bucket 1 | **0–2**      |
| Bucket 2 | **3–5**      |
| Bucket 3 | **6–9**      |
| Bucket 4 | **>10**      |


**Edge cases:**

- **Inclusive bounds:** Confirm whether **0** and **2** are both in the first bucket (typically **0 ≤ days ≤ 2**).
- **Boundary days:** 2 vs 3, 5 vs 6, 9 vs 10 — define consistently (e.g. floor of day difference).

### 5.3 48-hour first CV rule (office days)

- **Input:** Req **creation** timestamp, First CV shared timestamp, **office calendar** (org-specific holidays optional).
- **Logic:** Determine if elapsed **working** time ≤ 48 hours (not necessarily two calendar days).
- **Output:** Boolean per requisition — e.g. **Met / Not Met** (or pass/fail), suitable for summary KPIs and drill-down.

### 5.4 Source of hire — categories & commercial framing

**Categories (fixed list for v1):**

1. **RPO** — framed as **beneficial** (higher revenue / preferred economics).
2. **Direct**
3. **External Requisition** *(spelling as requested; consider normalizing to “External Requisition” in UI)*
4. **Internal Job portal**
5. **Transferred**

**Commercial interpretation (as stated):**

- **RPO** → **beneficial** (gain).
- **All other listed sources** → **loss** relative to RPO (lower revenue), for the purpose of this tab’s messaging and optional scoring.

**Implementation note:** Actual monetary amounts may require contract mapping; the PRD treats this as a **categorical weighting** unless finance supplies a revenue model.

---

## 6. UI / UX expectations (non-prescriptive but aligned to reference)

Reference: “Pipeline & commercial” style — titled section, subtitle, rows for status and amounts, **two date fields side-by-side** with labels like **CREATED** / **JOINING**, optional JSON block.

For **Revenue Leakage**, recommended building blocks:

1. **Page header** — Tab title, short description of what “leakage” and “ageing” mean in this module.
2. **Filters** — At minimum: **Month** selector; optional: region, account, source of hire, cancellation reason.
3. **Summary strip** — KPI cards: e.g. count of cancelled reqs in month, avg ageing, % meeting 48h first CV rule, mix by source.
4. **Position / requisition table** — Sortable columns including: Req ID, Req Assigned Date, Req Created Date, First CV Shared Date, ageing days, 48h SLA flag, cancellation date, source of hire, commercial classification (benefit vs loss).
5. **Charts** — Ageing bucket histogram; optional source mix chart.
6. **Detail drawer** — Optional row click to see timeline and raw attributes (similar spirit to “additional JSON” fields elsewhere).

---

## 7. Open questions & dependencies

1. **Month definition for “cancelled requisitions for that month”** — cancellation date vs create date vs last activity.
2. **Single source of truth** for **Req Assigned Date**, **Req Created Date**, **First CV Shared Date** — which system events map to these fields in the database/API?
3. **Business calendar** — definition of “office days” (Sat/Sun off only vs India public holidays vs client-specific).
4. **Day difference for ageing** — calendar days vs business days (buckets are in whole days; align with finance).
5. **Revenue quantification** — currency leakage vs qualitative “loss” labels for non-RPO sources.
6. **Login modal frequency** — every login vs once per session vs first login only.
7. **Permissions** — which roles see Revenue Leakage and company values modal.

---

## 8. Acceptance criteria (high level)

- **Values modal:** After login, user sees Purpose / Mission / Vision with exact copy; user can dismiss and continue.
- **Revenue Leakage tab:** Visible in nav; loads without error; filters by month; lists/aggregates cancelled requisitions per agreed date rule.
- **Metrics:** Average **(First CV Shared − Req Assigned)** computed; bucket distribution **0–2, 3–5, 6–9, >10** displayed.
- **48h rule:** Evaluated from **req creation** to first CV share, **excluding non–office days**, surfaced per row and in summary.
- **Source of hire:** All five categories available; RPO marked beneficial, others as loss in the commercial framing of this tab.

---

## 9. Document control


| Item       | Detail                                       |
| ---------- | -------------------------------------------- |
| **Title**  | Taggd values (login) & Revenue Leakage — PRD |
| **Format** | Markdown                                     |
| **Code**   | None (requirements only)                     |


---

*End of document.*