# Taggd Tracker Upload Guide

**Template file:** `excel_upload_masters/taggd_standard_tracker_template.xlsx`  
**Also served at:** `/static/taggd_standard_tracker_template.xlsx` (download button in Ingestion Center)  
**Upload path:** Ingestion Center → **Direct Upload** tab  
**Regenerate template:** `PYTHONPATH=. python3 excel_upload_masters/generate_taggd_tracker_template.py`

---

## Who this guide is for

Anyone preparing a client tracker workbook for upload — including non-technical users. The template itself contains full instructions on its **READ ME FIRST** sheet. This document is for team members who need a deeper reference.

---

## Template structure — four sheets

| Sheet | Purpose |
|---|---|
| **READ ME FIRST** | Step-by-step instructions, colour guide, metric-impact table, fee formula in plain English, 5 common mistakes |
| **Position Tracker** | Data entry — one row per requisition or candidate |
| **Contractual** | Fee structure — AI reads this to compute revenue for every joined candidate |
| **Reference** | All dropdown values with descriptions, metric-impact table, system-generated columns list |

---

## How to prepare the file

### Step 1 — Name the file correctly

Use the exact client account name followed by "Tracker":

```
Maruti Suzuki Tracker.xlsx
Ambuja Cement Tracker.xlsx
```

The Matchmaker AI uses the filename to link data to the correct client project. A generic name like `Tracker.xlsx` will create a new unknown account.

### Step 2 — Fill the Position Tracker sheet

One row = one open position (if no candidate yet) or one candidate on a position.  
Start from **Row 4** — rows 3–7 are worked examples (delete them before uploading).

The tracker sheet is divided into **8 colour-coded sections**:

| Section colour | Section name | Fields | Why it matters |
|---|---|---|---|
| Red | Must Fill | Req ID, Position Title, Current Status, Candidate Name | Every metric; row skipped without these |
| Blue | Role Details | Hiring Manager, Dept, Location, Zone, BU, Division, Grade, Priority, Job Type | Pipeline filters, data quality score |
| Green | Key Dates | Req Created, Mandate Received, First CV Share, Selection, Offered, Offer Accepted, **Joining Date**, Cancelled, Closure | Ageing, TTO, TTF, SLA, **revenue trigger** |
| Yellow | CTC & Revenue | Offered CTC (Lakhs), CTC Budget (LPA) | All revenue calculations |
| Purple | Source | Source Joiner Type, Source of Hire, Sub Source | RPO mix %, ER/IJP flat fee routing |
| Teal | Taggd Team | Recruiter, Sourcer, PM, HRBP, Hiring Agency | Recruiter productivity, SLA attribution |
| Orange | Funnel | Profiles Sourced/Submitted, Interviews, Offers Released/Accepted, Positions Open | Hit ratio, Offer Drop Rate, OAR |
| Grey | Additional | Stage, Mandate Status, IJP/Referral, Billing Month, FY Label | Misc analytics and billing |

Row 1 = section banners. Row 2 = column headers (AI reads these exact names). Row 3 = plain-English hints with metric callouts. Rows 4–8 = five complete worked examples.

### Step 3 — Fill the Contractual sheet

One row per fee band. Flat table — no merged cells, no stacked headers.

| Column | What to enter |
|---|---|
| CTC Band | e.g. `All`, `Below 40 Lakhs`, `40–80 Lakhs` |
| Opening Fee % | % of Offered CTC when position opens, e.g. `1.10%` or `0.011` |
| Closing Fee % | % of Offered CTC when candidate joins, e.g. `2.40%` or `0.024` |
| ER / IJP Flat Fee (₹) | Flat INR per ER or IJP joiner, e.g. `1200`. Enter `0` if not applicable. |

The AI reads this sheet once per project upload and generates a Python function that calculates fees. If contract terms change, upload a new file — the logic is regenerated automatically.

---

## Critical fields and what they drive

### Joining Date — the single most important date

When `Joining Date` is filled and `Current Status = Joined`:
- The record is marked **CLOSED** in the global status
- The **closing fee** is calculated: `Offered CTC × Closing Fee %`
- The candidate appears in **joiner counts** across all dashboards

If Joining Date is blank, the position stays ACTIVE and **no closing fee is booked**, even if status says Joined.

### Offered CTC (Lakhs) — always in Lakhs, never in full rupees

```
WRONG: enter 4500000  (full rupees)
RIGHT: enter 45       (Lakhs)
```

The system multiplies by 1,00,000 internally. Entering full rupees makes every revenue figure 100,000x too high.

### Source Joiner Type — changes the fee calculation route

| Value | Fee route |
|---|---|
| `Taggd RPO` | Opening % + Closing % of Offered CTC |
| `Taggd Direct` | Opening % + Closing % of Offered CTC |
| `ER – Employee Referral` | Flat fee per joiner from Contractual sheet |
| `IJP – Internal Job Posting` | Flat fee per joiner from Contractual sheet |
| `Campus` | Contract-specific |
| `Internal Transfer` | Contract-specific |

### Req Created Date — anchor for ageing and TTO/TTF

- **Ageing** = today − Req Created Date (for all non-closed positions)
- **TTO** = Offered Date − Req Created Date
- **TTF** = Joining Date − Req Created Date

If Req Created Date is missing, these three metrics become null for that row.

---

## Dropdown values reference

### Current Status

| Value | Meaning |
|---|---|
| Open | Live, being actively worked |
| Screening | CVs being reviewed |
| Interview | Candidate in interview process |
| Offered | Offer letter released |
| Joined | Candidate has joined — closing fee triggered |
| On Hold | Position paused |
| Rejected | Candidate rejected |
| Cancelled | Position formally withdrawn |
| Closed | Position closed without placement |

### Source Joiner Type

| Value | Description |
|---|---|
| Taggd RPO | Sourced through Taggd RPO contract — % of CTC fee |
| Taggd Direct | Placed directly by Taggd — % of CTC fee |
| ER – Employee Referral | Referred by client employee — flat fee |
| IJP – Internal Job Posting | Internal hire — flat fee |
| Campus | Campus drive hire |
| Internal Transfer | Internal move within client org |

### Ageing Bracket

`0-2 weeks`, `3-5 weeks`, `6-9 weeks`, `Over 10 weeks`, `No data`

Leave blank — the system calculates from dates if available.

---

## Fields generated by the system — do not add these columns

| Field | What it is |
|---|---|
| `Global Status` | Derived from Current Status + Joining Date + revenue logic: CLOSED / ACTIVE / PIPELINE / ON HOLD |
| `Revenue` | Calculated: Offered CTC × fee % from Contractual |
| `Opening Fee` | Calculated component |
| `Closing Fee` | Calculated component |
| `Fingerprint` | Row identity hash for delta-sync |
| `Project ID` | Assigned from filename match |
| `id` / `Record ID` | Auto-increment primary key |
| `Created At` / `Updated At` | Database timestamps |

---

## How metrics are derived from tracker data

```
Offered CTC (Lakhs)  ──→  × Closing Fee %  ──→  closing_fee
                                               │
Joining Date  ──────────────────────────────→ global_status = CLOSED
                                               │
                                               ↓
                                        revenue_results JSON
                                               │
                       ┌───────────────────────┤
                       ↓                       ↓
              Revenue dashboard        Portfolio Intelligence
              (tracker-derived)        composite score

Req Created Date  ──→  today − created  ──→  Ageing days
                  ──→  Offered Date − created  ──→  TTO
                  ──→  Joining Date − created  ──→  TTF

Profiles Sourced  ──→  Final hires / Sourced  ──→  Hit Ratio
Profiles Submitted ─→  Shortlists / Submitted  ──→  First Time Right
Offers Released   ──→  Drops / Released  ──→  Offer Drop Rate
Offers Accepted   ──→  Joined / Accepted  ──→  Offer Acceptance Rate

Source Joiner Type = taggd_rpo  ──→  RPO mix %
Source Joiner Type = ER / IJP   ──→  flat fee (not % of CTC)
```

---

## Five example rows in the template

| Row | Scenario | Key fields shown |
|---|---|---|
| Row 4 | Open position — no candidate | Req ID, Title, Status=Open, org details |
| Row 5 | Candidate in interview | Partial dates, funnel counts, no CTC |
| Row 6 | Offer released, awaiting joining | Offered Date + CTC, Source Joiner Type |
| Row 7 | Candidate joined — revenue triggered | All dates complete, Status=Joined, Joining Date filled |
| Row 8 | Position on hold | Status=On Hold, Current Stage note |

Delete all five example rows before uploading real data.

---

## Common mistakes

| Mistake | Effect | Fix |
|---|---|---|
| CTC in full rupees (e.g. 4500000) | Revenue 100,000× too high in every dashboard | Enter in Lakhs: 45 |
| Joining Date missing for joined candidates | Closing fee not calculated; position stays ACTIVE | Always fill Joining Date |
| Wrong filename (e.g. Tracker.xlsx) | New unknown account created instead of matching existing client | Name file after the client account |
| Stacked or merged cells in Contractual sheet | AI cannot parse fee structure; revenue logic fails | Use a flat single-header table |
| Adding system-generated columns | Confuses AI mapper; Global Status may be read instead of Current Status | Remove these columns from the Excel |
| Dates as text in unusual formats | Parser fails silently; date stored as null | Use DD-MMM-YYYY (e.g. 05-Nov-2025) |

---

## How to upload

1. Download the template from Ingestion Center → Direct Upload → **Download Template** button.
2. Fill in the Position Tracker and Contractual sheets.
3. Name the file after the client account.
4. Go to Ingestion Center → **Direct Upload** tab.
5. Drop the file or click to browse.
6. Wait 30–90 seconds for the pipeline to complete (AI calls are rate-limited).
7. Check Requisitions and the Client dashboard for your data.

### Re-uploading to update data

Drop the same file again any time. The delta-sync engine compares fingerprints and only updates rows that changed. Rows removed from the file are **not deleted** from the database.

---

## Ingestion Center tab reference

| Tab | Use for |
|---|---|
| **Direct Upload** | Standard template (this guide) |
| **Express** | Any existing client tracker — AI maps columns automatically |
| **Pro Path** | Complex multi-sheet files — review AI sheet picks before running |
| **SLA** | Raw SLA Basefile only |
| **WFM** | WFM Projected Headcount & Revenue file |
| **Finance** | Corporate Finance Data master (values in Lacs) |
| **Candidates** | Candidate Tracker workbook |
| **Run Log** | Per-session step logs for debugging |

---

*To regenerate the template after schema changes:*  
`PYTHONPATH=. python3 excel_upload_masters/generate_taggd_tracker_template.py`  
*Then copy the output to `frontend/public/static/` for the download button.*

