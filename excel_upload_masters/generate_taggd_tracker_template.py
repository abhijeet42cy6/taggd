#!/usr/bin/env python3
"""
Generate the Taggd Standard Tracker Template — user-friendly edition.

Produces: excel_upload_masters/taggd_standard_tracker_template.xlsx

Four sheets (in order):
  1. READ ME FIRST   — plain-English onboarding & instructions
  2. Position Tracker — data entry sheet (sections, hints, 5 example rows)
  3. Contractual      — fee table template
  4. Reference        — dropdown values, metric impact table, do-not-add list

Usage (from repo root):
  PYTHONPATH=. python3 excel_upload_masters/generate_taggd_tracker_template.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT_DIR = ROOT / "excel_upload_masters"
OUT_PATH = OUT_DIR / "taggd_standard_tracker_template.xlsx"

# ─── Palette ───────────────────────────────────────────────────────────────────
C_NAVY       = "1A2B4A"   # main header fill
C_WHITE      = "FFFFFF"
C_RED        = "C00000"   # must-fill section accent
C_RED_LIGHT  = "FFE0E0"   # must-fill header fill
C_BLUE       = "1F4E79"   # role details section accent
C_BLUE_LIGHT = "DDEEFF"
C_GREEN      = "375623"   # dates section accent
C_GREEN_LIGHT= "E2EFDA"
C_GOLD       = "7F6000"   # CTC/revenue section accent
C_GOLD_LIGHT = "FFF2CC"
C_PURPLE     = "5B2C8D"   # source section accent
C_PURPLE_LIGHT= "EDE7F6"
C_TEAL       = "1A5F6A"   # team section accent
C_TEAL_LIGHT = "D9F2F5"
C_ORANGE     = "843C0C"   # funnel section accent
C_ORANGE_LIGHT="FCE4D6"
C_GREY_DARK  = "404040"   # additional info accent
C_GREY_LIGHT = "F2F2F2"
C_DIVIDER    = "4A4A4A"   # section divider column fill
C_HINT_TEXT  = "404040"

thin = Side(style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
thick_left = Side(style="medium", color="888888")

def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)

def _font(bold=False, color="000000", size=10, italic=False) -> Font:
    return Font(bold=bold, color=color, size=size, name="Calibri", italic=italic)

def _align(wrap=True, h="left", v="center") -> Alignment:
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


# ─── SECTION DEFINITIONS ───────────────────────────────────────────────────────
# Each section: (section_name, fill_light, accent_dark, columns)
# Each column: (header, hint_text, col_type, db_field)
# col_type: M=mandatory, DV=dropdown, D=date, N=numeric, O=optional

SECTIONS = [
    (
        "MUST FILL — Every row needs these 4 columns",
        C_RED_LIGHT, C_RED,
        [
            (
                "Req ID",
                "[MUST FILL] The unique reference number your client uses for this position. "
                "Example: REQ-001 or 35525. This is how the system tracks the same position over time — "
                "if you re-upload next month, the system finds and updates this row. "
                "Each open position must have its own Req ID.",
                "M", "client_req_id",
            ),
            (
                "Position Title",
                "[MUST FILL] The exact job title of the role being hired. "
                "Example: Senior Manager – Finance or Plant Head. "
                "This appears in every pipeline report and requisition dashboard.",
                "M", "position_title",
            ),
            (
                "Current Status",
                "[MUST FILL] Where is this position right now? Pick from the dropdown. "
                "Open = live and being worked on. "
                "Joined = candidate has joined (the system auto-calculates closing fee). "
                "On Hold = paused. Cancelled = withdrawn. "
                "This drives the pipeline counts and revenue dashboards.",
                "DV", "status",
            ),
            (
                "Candidate Name",
                "[MUST FILL] Full name of the candidate being considered for this role. "
                "Example: Rajesh Kumar. "
                "Leave blank only if the position is open with no candidate yet — "
                "the system will hold the row under the Req ID until a candidate is added.",
                "O", "candidate_name",
            ),
        ],
    ),
    (
        "ROLE DETAILS — Filters, org structure & data quality",
        C_BLUE_LIGHT, C_BLUE,
        [
            (
                "Hiring Manager",
                "[ROLE] Full name of the client-side person approving this hire. "
                "Example: Anita Sharma. "
                "Used in pipeline drilldown and hiring manager productivity reports.",
                "O", "hiring_manager",
            ),
            (
                "Department",
                "[ROLE] The client department this role belongs to. "
                "Example: Finance, Manufacturing, IT, Sales. "
                "Used in pipeline filters and department-wise analytics.",
                "O", "department",
            ),
            (
                "Location",
                "[ROLE] City or site where the candidate will work. "
                "Example: Gurgaon or Mumbai – Andheri. "
                "Required for the data quality score — missing locations reduce the score.",
                "O", "location",
            ),
            (
                "Zone",
                "[ROLE] Geographic zone. Example: North, West 1, South. "
                "Used in regional reporting.",
                "O", "rpo_zone",
            ),
            (
                "Business Unit",
                "[ROLE] The client's business unit or SBU code. "
                "Example: PLSFHR, SLHR, Auto Division. "
                "Used to group reqs by org structure.",
                "O", "rpo_bu_sbu",
            ),
            (
                "Division",
                "[ROLE] Division within the business unit. "
                "Example: VGLSCD, RLTY, Passenger Cars.",
                "O", "rpo_division",
            ),
            (
                "Band / Grade",
                "[ROLE] Seniority level of the role. "
                "Example: L5, M3, Manager, DGM, VP.",
                "O", "rpo_grade_band",
            ),
            (
                "Vertical",
                "[ROLE] Business vertical. "
                "Example: Manufacturing, Corporate, IT, Finance.",
                "O", "rpo_vertical",
            ),
            (
                "Priority",
                "[ROLE] Urgency of this hire. "
                "Example: High, Medium, Low, Critical.",
                "O", "rpo_priority",
            ),
            (
                "Job Type",
                "[ROLE] Is this a new hire or a replacement? "
                "Options: New Hire, Replacement, IJP, Campus.",
                "O", "rpo_job_type",
            ),
        ],
    ),
    (
        "KEY DATES — Ageing, Time-to-Offer & Time-to-Fill are calculated from these",
        C_GREEN_LIGHT, C_GREEN,
        [
            (
                "Req Created Date",
                "[DATES] The date this position was first opened / created. "
                "Format: 05-Apr-2025 or 2025-04-05. "
                "This is the start point for calculating how long a position has been open (Ageing).",
                "D", "creation_date",
            ),
            (
                "Mandate Received Date",
                "[DATES] The date Taggd officially received the mandate from the client. "
                "Format: 05-Apr-2025. "
                "Used for SLA reporting — when did the clock start?",
                "D", "mandate_received_date",
            ),
            (
                "Intake Date",
                "[DATES] The date the intake meeting with the hiring manager was held. "
                "Format: 07-Apr-2025.",
                "D", "intake_date",
            ),
            (
                "First CV Share Date",
                "[DATES] The date the first CV was shared with the client. "
                "Format: 10-Apr-2025. "
                "Used in SLA reporting — how quickly did Taggd start submitting?",
                "D", "first_cv_share_date",
            ),
            (
                "Candidate Selection Date",
                "[DATES] The date the client selected / shortlisted this candidate. "
                "Format: 25-Apr-2025.",
                "D", "selection_date_req",
            ),
            (
                "Offered Date",
                "[DATES] The date the offer letter was released to the candidate. "
                "Format: 02-May-2025. "
                "Used to calculate Time-to-Offer (from Req Created to Offer).",
                "D", "req_offered_date",
            ),
            (
                "Offer Accepted Date",
                "[DATES] The date the candidate formally accepted the offer. "
                "Format: 05-May-2025.",
                "D", "offered_accept_date",
            ),
            (
                "Joining Date",
                "[REVENUE + DATES] The actual date the candidate walked in on Day 1. "
                "Format: 02-Jun-2025. "
                "THIS IS THE MOST IMPORTANT DATE. "
                "When filled: the position becomes Closed in the dashboard AND the closing fee "
                "is calculated automatically. Without this date, the joiner will not show "
                "revenue even if Current Status = Joined.",
                "D", "joining_date",
            ),
            (
                "Req Cancelled Date",
                "[DATES] If the position was cancelled, the date it was withdrawn. "
                "Format: 15-May-2025.",
                "D", "req_cancelled_date",
            ),
            (
                "LOI Date",
                "[DATES] Date the Letter of Intent was issued, if applicable. "
                "Format: 28-Apr-2025.",
                "D", "loi_date_req",
            ),
            (
                "Closure Date",
                "[DATES] Date the requisition was formally closed (whether filled or not). "
                "Format: 03-Jun-2025.",
                "D", "closure_date_req",
            ),
        ],
    ),
    (
        "CTC & REVENUE — Wrong unit here = wrong revenue in every dashboard",
        C_GOLD_LIGHT, C_GOLD,
        [
            (
                "Offered CTC (Lakhs)",
                "[REVENUE] The salary package offered to the candidate, in LAKHS. "
                "NOT in full rupees. NOT in thousands. ONLY in Lakhs. "
                "Example: if salary is Rs 45 Lakhs per annum, enter 45. "
                "If salary is Rs 12.5 Lakhs, enter 12.5. "
                "This number × the fee percentage in your Contractual sheet = Taggd fee. "
                "Entering the wrong unit (e.g. 4500000 instead of 45) will multiply "
                "every revenue figure by 100,000.",
                "N", "offered_ctc",
            ),
            (
                "CTC Budget (LPA)",
                "[REVENUE] The maximum salary budgeted for this role, in Lakhs per annum. "
                "Example: if the budget is Rs 50 Lakhs, enter 50. "
                "Used in budget vs actual CTC analytics.",
                "N", "ctc_budget_lpa",
            ),
        ],
    ),
    (
        "WHO FOUND THE CANDIDATE — Source mix %, RPO analytics & flat-fee routes",
        C_PURPLE_LIGHT, C_PURPLE,
        [
            (
                "Source Joiner Type",
                "[REVENUE] How was this candidate sourced? Pick from the dropdown. "
                "Taggd RPO = Taggd found the candidate through the RPO contract — fee = % of CTC. "
                "Taggd Direct = placed directly by Taggd — fee = % of CTC. "
                "ER (Employee Referral) = client employee referred the candidate — "
                "uses a flat fee from the Contractual sheet instead of % of CTC. "
                "IJP (Internal Job Posting) = internal hire — also uses a flat fee. "
                "Campus / Transferred = other routes. "
                "This field directly changes which fee calculation is used.",
                "DV", "source_joiner_type",
            ),
            (
                "Source of Hire",
                "[SOURCE] Where did the CV come from? Free text. "
                "Example: LinkedIn, Naukri, Employee Referral, Campus Drive, "
                "Internal Reference – Priya Mehta.",
                "O", "rpo_source_of_hire",
            ),
            (
                "Sub Source",
                "[SOURCE] More detail on the source. "
                "Example: LinkedIn Premium, Naukri Resdex, WhatsApp group.",
                "O", "rpo_sub_source",
            ),
        ],
    ),
    (
        "TAGGD TEAM — Recruiter productivity & SLA attribution",
        C_TEAL_LIGHT, C_TEAL,
        [
            (
                "Assigned Recruiter",
                "[TEAM] Full name of the Taggd recruiter responsible for this req. "
                "Example: Priya Mehta. "
                "Used in recruiter-level productivity and SLA reports.",
                "O", "assigned_recruiter_rpo",
            ),
            (
                "Sourcer",
                "[TEAM] Full name of the Taggd sourcer (if different from recruiter). "
                "Example: Amit Singh.",
                "O", "rpo_sourcer",
            ),
            (
                "Taggd PM",
                "[TEAM] Full name of the Taggd Program Manager / Account SPOC. "
                "Example: Neha Kapoor.",
                "O", "rpo_taggd_pm",
            ),
            (
                "BHR / HRBP",
                "[TEAM] Full name of the client's HR Business Partner for this req. "
                "Example: Sunita Verma.",
                "O", "rpo_business_hrbp",
            ),
            (
                "Hiring Agency",
                "[TEAM] Name of any external agency also working this req, if applicable. "
                "Leave blank if Taggd is the only partner.",
                "O", "rpo_hiring_agency",
            ),
        ],
    ),
    (
        "RECRUITMENT FUNNEL — Hit ratio, offer drop rate & conversion analytics",
        C_ORANGE_LIGHT, C_ORANGE,
        [
            (
                "Profiles Sourced",
                "[FUNNEL] Total number of CVs collected for this position. "
                "Enter a whole number. Example: 42. "
                "Used to calculate Hit Ratio (how many CVs did it take to get a hire?).",
                "N", "profiles_sourced",
            ),
            (
                "Profiles Submitted",
                "[FUNNEL] Number of CVs actually shared with / submitted to the client. "
                "Enter a whole number. Example: 12. "
                "Used in First Time Right ratio (shortlists / submitted).",
                "N", "profiles_submitted",
            ),
            (
                "Interviews Scheduled",
                "[FUNNEL] Number of interviews that were scheduled. "
                "Enter a whole number. Example: 6.",
                "N", "interviews_scheduled",
            ),
            (
                "Offers Released",
                "[FUNNEL] Number of offers made for this req. "
                "Enter a whole number. Example: 2. "
                "Used in Offer Drop Rate = Offers dropped / Offers released.",
                "N", "offers_released",
            ),
            (
                "Offers Accepted",
                "[FUNNEL] Number of offers that were accepted by candidates. "
                "Enter a whole number. Example: 1. "
                "Used in Offer Acceptance Rate.",
                "N", "offers_accepted",
            ),
            (
                "Positions Open",
                "[FUNNEL] How many seats are open for this Req ID? "
                "Usually 1. Enter 2 or more only if multiple identical roles share one Req ID.",
                "N", "positions_open",
            ),
            (
                "Ageing Days",
                "[FUNNEL] How many days has this position been open? "
                "You can leave this blank — the system calculates it from Req Created Date. "
                "Fill it in only if you want to override the calculated value.",
                "N", "ageing_days",
            ),
            (
                "Ageing Bracket",
                "[FUNNEL] Which time bucket does the ageing fall into? "
                "Pick from the dropdown. Leave blank to let the system assign it. "
                "Buckets: 0-2 weeks, 3-5 weeks, 6-9 weeks, over 10 weeks.",
                "DV", "ageing_bracket",
            ),
            (
                "TTO Days",
                "[FUNNEL] Time to Offer — how many days from req created to offer released. "
                "You can leave blank; the system calculates from dates if both are filled.",
                "N", "tto_days",
            ),
            (
                "TTF Days",
                "[FUNNEL] Time to Fill — how many days from req created to candidate joining. "
                "Leave blank; calculated automatically when Req Created Date and Joining Date are both present.",
                "N", "ttf_days",
            ),
        ],
    ),
    (
        "ADDITIONAL INFO — Misc tracking & billing",
        C_GREY_LIGHT, C_GREY_DARK,
        [
            (
                "Current Stage",
                "[INFO] Free text note on where the candidate is right now. "
                "Example: L2 Interview scheduled, Final Round – awaiting HM decision.",
                "O", "rpo_stage",
            ),
            (
                "Mandate Status",
                "[INFO] The lifecycle status of the requisition itself (different from candidate pipeline). "
                "Example: Open, Closed, On Hold, Cancelled.",
                "O", "rpo_mandate_status",
            ),
            (
                "IJP / Referral",
                "[INFO] For internal hires or referrals — the IJP posting ID or name of the referring employee. "
                "Example: IJP-2025-044 or Referred by Suresh Nair.",
                "O", "rpo_ijp_referral",
            ),
            (
                "Billing Month",
                "[INFO] The month this joining should be billed in. "
                "Example: Jun-2025. Fill only if different from the actual joining month.",
                "O", "billing_month",
            ),
            (
                "FY Label",
                "[INFO] The financial year this position belongs to. "
                "Example: FY2025-26. The system sets this automatically; "
                "fill only to override.",
                "O", "fy_label",
            ),
            (
                "Taggd Fee Amount",
                "[INFO] The confirmed fee in absolute Rupees (not Lakhs). "
                "Example: 45000. Fill this only for billing reconciliation rows where "
                "the exact fee has been agreed and invoiced.",
                "N", "taggd_fees_amount",
            ),
        ],
    ),
]

# Flat list of (section_name, fill_light, accent_dark, col_tuple) — for per-column access
def _flat_columns():
    result = []
    for sec_name, fill_light, accent_dark, cols in SECTIONS:
        for col in cols:
            result.append((sec_name, fill_light, accent_dark, col))
    return result

FLAT_COLS = _flat_columns()

PIPELINE_STATUS_VALUES = [
    "Open", "Offered", "Joined", "On Hold", "Cancelled",
    "Screening", "Interview", "Rejected", "Closed",
]

SOURCE_JOINER_VALUES = [
    "Taggd RPO", "Taggd Direct",
    "ER – Employee Referral", "IJP – Internal Job Posting",
    "Campus", "Internal Transfer",
]
# Internal values that map to DB enums (used in data-validation only)
SOURCE_JOINER_DB = [
    "taggd_rpo", "taggd_direct",
    "nontaggd_employee_referral", "nontaggd_internal_job_portal",
    "nontaggd_campus", "nontaggd_transferred",
]

SOURCE_JOINER_DB_TO_LABEL = {
    "taggd_rpo": "Taggd RPO",
    "taggd_direct": "Taggd Direct",
    "nontaggd_employee_referral": "ER – Employee Referral",
    "nontaggd_internal_job_portal": "IJP – Internal Job Posting",
    "nontaggd_campus": "Campus",
    "nontaggd_transferred": "Internal Transfer",
}

AGEING_BRACKET_VALUES = ["0-2 weeks", "3-5 weeks", "6-9 weeks", "Over 10 weeks", "No data"]

# ─── EXAMPLE ROWS ──────────────────────────────────────────────────────────────
EXAMPLE_ROWS = [
    {
        "scenario": "Open position — no candidate yet",
        "Req ID": "REQ-001",
        "Position Title": "Plant Head – Manesar",
        "Current Status": "Open",
        "Candidate Name": "",
        "Hiring Manager": "Rajiv Sharma",
        "Department": "Manufacturing",
        "Location": "Manesar",
        "Zone": "North",
        "Business Unit": "Auto Division",
        "Band / Grade": "VP",
        "Priority": "High",
        "Job Type": "New Hire",
        "Req Created Date": "01-Apr-2025",
        "Mandate Received Date": "02-Apr-2025",
        "Positions Open": "1",
        "FY Label": "FY2025-26",
    },
    {
        "scenario": "Candidate in interview — partial data",
        "Req ID": "REQ-002",
        "Position Title": "Senior Manager – Finance",
        "Current Status": "Interview",
        "Candidate Name": "Ananya Singh",
        "Hiring Manager": "Deepak Mehta",
        "Department": "Finance",
        "Location": "Gurgaon",
        "Zone": "North",
        "Business Unit": "SLHR",
        "Band / Grade": "M3",
        "Priority": "Medium",
        "Job Type": "Replacement",
        "Req Created Date": "05-Apr-2025",
        "Mandate Received Date": "06-Apr-2025",
        "First CV Share Date": "09-Apr-2025",
        "CTC Budget (LPA)": "40",
        "Source of Hire": "Naukri",
        "Assigned Recruiter": "Priya Mehta",
        "Profiles Sourced": "18",
        "Profiles Submitted": "5",
        "Interviews Scheduled": "2",
        "Positions Open": "1",
        "FY Label": "FY2025-26",
    },
    {
        "scenario": "Offer released — awaiting joining",
        "Req ID": "REQ-003",
        "Position Title": "DGM – Supply Chain",
        "Current Status": "Offered",
        "Candidate Name": "Vikram Nair",
        "Hiring Manager": "Sunita Khanna",
        "Department": "Supply Chain",
        "Location": "Pune",
        "Zone": "West 1",
        "Business Unit": "Operations",
        "Band / Grade": "DGM",
        "Priority": "High",
        "Job Type": "New Hire",
        "Req Created Date": "10-Mar-2025",
        "Mandate Received Date": "11-Mar-2025",
        "First CV Share Date": "14-Mar-2025",
        "Candidate Selection Date": "28-Mar-2025",
        "Offered Date": "03-Apr-2025",
        "Offered CTC (Lakhs)": "52",
        "CTC Budget (LPA)": "55",
        "Source Joiner Type": "Taggd RPO",
        "Source of Hire": "LinkedIn",
        "Assigned Recruiter": "Amit Singh",
        "Profiles Sourced": "32",
        "Profiles Submitted": "7",
        "Interviews Scheduled": "3",
        "Offers Released": "1",
        "Positions Open": "1",
        "FY Label": "FY2025-26",
    },
    {
        "scenario": "Candidate JOINED — closing fee triggered",
        "Req ID": "REQ-004",
        "Position Title": "AGM – HR Business Partner",
        "Current Status": "Joined",
        "Candidate Name": "Meera Joshi",
        "Hiring Manager": "Rajan Pillai",
        "Department": "Human Resources",
        "Location": "Mumbai",
        "Zone": "West 2",
        "Business Unit": "Corporate HR",
        "Band / Grade": "AGM",
        "Priority": "High",
        "Job Type": "Replacement",
        "Req Created Date": "15-Jan-2025",
        "Mandate Received Date": "16-Jan-2025",
        "First CV Share Date": "22-Jan-2025",
        "Candidate Selection Date": "15-Feb-2025",
        "Offered Date": "20-Feb-2025",
        "Offer Accepted Date": "22-Feb-2025",
        "Joining Date": "01-Apr-2025",
        "Offered CTC (Lakhs)": "45",
        "CTC Budget (LPA)": "48",
        "Source Joiner Type": "Taggd RPO",
        "Source of Hire": "LinkedIn",
        "Assigned Recruiter": "Neha Kapoor",
        "Profiles Sourced": "24",
        "Profiles Submitted": "6",
        "Interviews Scheduled": "4",
        "Offers Released": "2",
        "Offers Accepted": "1",
        "Positions Open": "1",
        "FY Label": "FY2025-26",
        "Billing Month": "Apr-2025",
    },
    {
        "scenario": "Position on hold — no candidate progress",
        "Req ID": "REQ-005",
        "Position Title": "Manager – Digital Marketing",
        "Current Status": "On Hold",
        "Candidate Name": "",
        "Hiring Manager": "Kavya Reddy",
        "Department": "Marketing",
        "Location": "Bengaluru",
        "Zone": "South",
        "Business Unit": "Digital",
        "Band / Grade": "Manager",
        "Priority": "Low",
        "Job Type": "New Hire",
        "Req Created Date": "01-Feb-2025",
        "Mandate Received Date": "03-Feb-2025",
        "Positions Open": "1",
        "FY Label": "FY2025-26",
        "Current Stage": "HM on leave — review pending after April 15",
    },
]


def _make_dv(ws, values: list[str], col_idx: int, prompt: str, title: str) -> None:
    formula = '"' + ",".join(v.replace(",", "") for v in values) + '"'
    dv = DataValidation(
        type="list",
        formula1=formula,
        allow_blank=True,
        showDropDown=False,
        showErrorMessage=True,
        errorTitle="Invalid value",
        error=f"Please choose from the dropdown list. {prompt}",
        showInputMessage=True,
        promptTitle=title,
        prompt=prompt,
    )
    col_letter = get_column_letter(col_idx)
    dv.sqref = f"{col_letter}3:{col_letter}10000"
    ws.add_data_validation(dv)


# ─── SHEET 1: READ ME FIRST ────────────────────────────────────────────────────

def build_readme_sheet(ws) -> None:
    ws.title = "READ ME FIRST"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 28
    ws.column_dimensions["C"].width = 72
    ws.column_dimensions["D"].width = 3

    def _write(row, col, text, bold=False, size=11, color="000000", fill=None,
               wrap=True, h="left", italic=False, indent=0):
        cell = ws.cell(row=row, column=col, value=text)
        cell.font = _font(bold=bold, color=color, size=size, italic=italic)
        cell.alignment = Alignment(horizontal=h, vertical="center", wrap_text=wrap, indent=indent)
        if fill:
            cell.fill = _fill(fill)
        return cell

    def _heading(row, text, fill=C_NAVY, color=C_WHITE, size=13):
        ws.merge_cells(f"B{row}:C{row}")
        c = ws.cell(row=row, column=2, value=text)
        c.font = _font(bold=True, color=color, size=size)
        c.fill = _fill(fill)
        c.alignment = _align(wrap=False, h="left")
        c.border = border
        ws.row_dimensions[row].height = 26

    def _row2(row, label, detail, label_fill=None, detail_fill=None):
        lc = ws.cell(row=row, column=2, value=label)
        lc.font = _font(bold=True, size=10)
        lc.alignment = _align(wrap=True)
        lc.border = border
        if label_fill:
            lc.fill = _fill(label_fill)
        dc = ws.cell(row=row, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        if detail_fill:
            dc.fill = _fill(detail_fill)
        ws.row_dimensions[row].height = 48

    r = 1
    ws.row_dimensions[r].height = 18
    r += 1

    # Title
    ws.merge_cells(f"B{r}:C{r}")
    tc = ws.cell(row=r, column=2, value="Taggd Recruitment Tracker — How to Fill This File")
    tc.font = _font(bold=True, color=C_WHITE, size=16)
    tc.fill = _fill(C_NAVY)
    tc.alignment = _align(wrap=False, h="left")
    ws.row_dimensions[r].height = 36
    r += 1

    ws.merge_cells(f"B{r}:C{r}")
    sc = ws.cell(row=r, column=2,
                 value="Read this sheet first. It explains what each section does and why it matters.")
    sc.font = _font(italic=True, size=11, color="595959")
    sc.alignment = _align(wrap=False, h="left")
    ws.row_dimensions[r].height = 22
    r += 2

    # ── How to use ──
    _heading(r, "STEP-BY-STEP: HOW TO USE THIS FILE")
    r += 1
    steps = [
        ("Step 1 — Name the file correctly",
         "Name this file after the client account exactly as it appears in the Taggd platform. "
         "Example: Maruti Suzuki Tracker.xlsx or Ambuja Cement Tracker.xlsx. "
         "The system uses the filename to match data to the right client account. "
         "A generic name like Tracker.xlsx will create a new unknown account."),
        ("Step 2 — Fill the Position Tracker sheet",
         "Go to the 'Position Tracker' sheet (next tab). Each row is one open position or one candidate. "
         "Columns with a RED background in Row 2 are mandatory — the row will be skipped without them. "
         "Fill from Row 3 onwards. Rows 3–7 are worked examples — you can delete them before uploading."),
        ("Step 3 — Fill the Contractual sheet",
         "Go to the 'Contractual' sheet. Fill in the fee percentages agreed with your client. "
         "This is used to calculate Taggd's fee for every joined candidate. "
         "The system reads this once per client — update it only when the contract changes."),
        ("Step 4 — Upload the file",
         "Go to the Taggd platform → Ingestion Center → Direct Upload tab. "
         "Drop this file in. The AI will read both sheets and load the data automatically. "
         "It usually takes 30–90 seconds."),
        ("Step 5 — Re-upload to update",
         "If a candidate's status changes (e.g. Offered → Joined), just update the row and upload "
         "the whole file again. The system will find and update only the rows that changed. "
         "It will NOT delete rows that are no longer in the file — safe to upload partial updates."),
    ]
    for label, detail in steps:
        _row2(r, label, detail)
        r += 1
    r += 1

    # ── Colour guide ──
    _heading(r, "COLOUR GUIDE — What the row 2 background colours mean")
    r += 1
    colour_guide = [
        ("Red background", "MUST FILL — the row will be ignored if this is blank", C_RED_LIGHT),
        ("Green background", "DATE field — enter in DD-MMM-YYYY format (e.g. 05-Nov-2025)", C_GREEN_LIGHT),
        ("Yellow background", "NUMBER — enter digits only. CTC is always in Lakhs, not full rupees", C_GOLD_LIGHT),
        ("Purple background", "DROPDOWN — click the cell and pick from the list. Do not type freehand", C_PURPLE_LIGHT),
        ("Blue background", "Role / org details — fill when available", C_BLUE_LIGHT),
        ("Teal background", "Taggd team members — recruiter, sourcer, PM names", C_TEAL_LIGHT),
        ("Orange background", "Recruitment funnel counts — CVs, interviews, offers", C_ORANGE_LIGHT),
        ("Grey background", "Additional info — optional, for billing and misc notes", C_GREY_LIGHT),
    ]
    for label, detail, fill_c in colour_guide:
        lc = ws.cell(row=r, column=2, value=label)
        lc.font = _font(bold=True, size=10)
        lc.fill = _fill(fill_c)
        lc.alignment = _align(wrap=True)
        lc.border = border
        dc = ws.cell(row=r, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        ws.row_dimensions[r].height = 30
        r += 1
    r += 1

    # ── Section → metric table ──
    _heading(r, "WHY EACH SECTION MATTERS — What happens in the dashboards")
    r += 1
    # header
    lh = ws.cell(row=r, column=2, value="Section in the tracker")
    lh.font = _font(bold=True, size=10, color=C_WHITE)
    lh.fill = _fill("595959")
    lh.border = border
    dh = ws.cell(row=r, column=3, value="What it drives in the platform")
    dh.font = _font(bold=True, size=10, color=C_WHITE)
    dh.fill = _fill("595959")
    dh.border = border
    ws.row_dimensions[r].height = 22
    r += 1

    impacts = [
        ("MUST FILL (Req ID, Status, Title)", C_RED_LIGHT,
         "These 4 columns are the foundation. Without them, the row is skipped entirely. "
         "Req ID is the identity anchor — it links the same position across multiple uploads. "
         "Current Status drives every pipeline count: open, offered, joined, cancelled."),
        ("KEY DATES (especially Joining Date)", C_GREEN_LIGHT,
         "Joining Date = closing fee calculated + position marked Closed in revenue dashboard. "
         "Req Created Date = used to calculate Ageing (how long a position has been open). "
         "Offered Date = used for Time-to-Offer (TTO). "
         "All dates together feed SLA performance reports."),
        ("CTC & REVENUE (Offered CTC in Lakhs)", C_GOLD_LIGHT,
         "Offered CTC × fee % from Contractual sheet = Taggd's fee. "
         "This appears in the Revenue dashboard, Portfolio Intelligence, and Billing tracker. "
         "Wrong unit (entering full INR instead of Lakhs) = revenue numbers 100,000x too high."),
        ("SOURCE JOINER TYPE", C_PURPLE_LIGHT,
         "Determines which fee calculation is used: "
         "Taggd RPO / Taggd Direct = % of CTC (from Contractual sheet). "
         "ER / IJP = flat fee per hire (also from Contractual sheet). "
         "Also feeds RPO source-mix % in the client pipeline dashboard."),
        ("RECRUITMENT FUNNEL (CVs, Offers)", C_ORANGE_LIGHT,
         "Profiles Sourced → Hit Ratio = how many CVs per hire. "
         "Profiles Submitted → First Time Right ratio. "
         "Offers Released + Offers Accepted → Offer Drop Rate and Offer Acceptance Rate. "
         "These appear in the Client Pipeline and SLA dashboards."),
        ("ROLE DETAILS (Location, Dept, BU)", C_BLUE_LIGHT,
         "Used in pipeline filters, department drilldowns, and the data quality score. "
         "Location is required for the data quality score — missing it reduces the score."),
        ("TAGGD TEAM (Recruiter, PM)", C_TEAL_LIGHT,
         "Recruiter name is used in recruiter productivity reports and SLA attribution. "
         "Taggd PM name is used for account-level team tracking."),
    ]
    for label, fill_c, detail in impacts:
        lc = ws.cell(row=r, column=2, value=label)
        lc.font = _font(bold=True, size=10)
        lc.fill = _fill(fill_c)
        lc.alignment = _align(wrap=True)
        lc.border = border
        dc = ws.cell(row=r, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        ws.row_dimensions[r].height = 60
        r += 1
    r += 1

    # ── Revenue formula plain English ──
    _heading(r, "HOW REVENUE IS CALCULATED — The simple version")
    r += 1
    revenue_paras = [
        ("Opening fee (when position is ACTIVE)",
         "Offered CTC (Lakhs) × Opening Fee % from Contractual sheet.\n"
         "Example: CTC = 45 Lakhs, Opening Fee = 1.1% → Opening fee = Rs 49,500."),
        ("Closing fee (when candidate JOINS)",
         "Offered CTC (Lakhs) × Closing Fee % from Contractual sheet.\n"
         "Example: CTC = 45 Lakhs, Closing Fee = 2.4% → Closing fee = Rs 1,08,000.\n"
         "This is only calculated when Joining Date is filled AND Current Status = Joined."),
        ("ER / IJP flat fee",
         "When Source Joiner Type = ER or IJP, the flat fee from the Contractual sheet is used "
         "instead of a % of CTC.\nExample: Flat fee = Rs 1,200 per ER joiner."),
        ("Where to see it in the platform",
         "Revenue Dashboard → Tracker-Derived Revenue section.\n"
         "Portfolio Intelligence → Revenue score per project.\n"
         "Client Dashboard → Revenue strip."),
    ]
    for label, detail in revenue_paras:
        _row2(r, label, detail, label_fill=C_GOLD_LIGHT)
        r += 1
    r += 1

    # ── Common mistakes ──
    _heading(r, "5 COMMON MISTAKES TO AVOID")
    r += 1
    mistakes = [
        ("CTC in full rupees instead of Lakhs",
         "WRONG: Offered CTC = 4500000. RIGHT: Offered CTC = 45. "
         "Entering full rupees will make every revenue figure 100,000 times too high."),
        ("Joining Date missing for joiners",
         "If a candidate has joined but Joining Date is blank, the system cannot calculate the "
         "closing fee and the position stays as ACTIVE instead of CLOSED in the dashboard."),
        ("Wrong file name",
         "File must be named after the client — e.g. 'Maruti Suzuki Tracker.xlsx'. "
         "A generic name like 'Tracker.xlsx' will create a new account called 'Tracker' "
         "instead of linking to the existing client."),
        ("Stacked or merged rows in Contractual sheet",
         "The Contractual sheet must be a flat table with one row per fee tier. "
         "Do not merge cells or use stacked headers — the AI cannot parse them."),
        ("Adding system-generated columns",
         "Do not add columns like 'Global Status', 'Revenue', 'Fingerprint', or 'Project ID'. "
         "These are generated automatically and will be ignored if present, but can confuse the AI mapper."),
    ]
    for i, (label, detail) in enumerate(mistakes, 1):
        _row2(r, f"Mistake {i}: {label}", detail)
        r += 1

    r += 1
    ws.row_dimensions[r].height = 18


# ─── SHEET 2: POSITION TRACKER ─────────────────────────────────────────────────

def build_tracker_sheet(ws, overrides: dict | None = None) -> None:
    ws.title = "Position Tracker"
    ws.sheet_view.showGridLines = True
    ws.sheet_view.zoomScale = 90
    ov = overrides or {}
    req_id_label = (ov.get("column_aliases") or {}).get("req_id") or "Req ID"

    def _display_header(header: str) -> str:
        if header == "Req ID" and req_id_label != "Req ID":
            return req_id_label
        return header

    def _example_value(example: dict, header: str):
        if header == "Req ID" and req_id_label != "Req ID":
            return example.get(req_id_label, example.get("Req ID", ""))
        return example.get(header, "")

    # Build column list interleaved with section dividers
    # col_list: list of ("divider", section_name, ...) or ("data", section_name, fill_l, accent, col_tuple)
    col_list = []
    prev_section = None
    for sec_name, fill_light, accent_dark, col in FLAT_COLS:
        if sec_name != prev_section:
            col_list.append(("divider", sec_name, fill_light, accent_dark))
            prev_section = sec_name
        col_list.append(("data", sec_name, fill_light, accent_dark, col))

    # Assign actual Excel column indices
    excel_cols = {}  # item_index → col_idx
    col_idx = 1
    for i, item in enumerate(col_list):
        excel_cols[i] = col_idx
        col_idx += 1

    total_cols = col_idx - 1

    # ── Row 1: Section banners ──────────────────────────────────────────────────
    section_starts = {}   # section_name → first data col_idx
    section_ends   = {}   # section_name → last data col_idx (for merging)
    for i, item in enumerate(col_list):
        sec = item[1]
        ci = excel_cols[i]
        if item[0] == "data":
            if sec not in section_starts:
                section_starts[sec] = ci
            section_ends[sec] = ci
        elif item[0] == "divider":
            # divider col gets section name in row 1
            pass

    # Row 1 = Section banner (merged across data cols of each section)
    for sec_name, fill_light, accent_dark, cols in SECTIONS:
        start = section_starts.get(sec_name)
        endcol = section_ends.get(sec_name)
        if start is None:
            continue
        # Section label in divider col (just before start)
        div_ci = start - 1
        if div_ci >= 1:
            dc = ws.cell(row=1, column=div_ci, value="")
            dc.fill = _fill(accent_dark)
        if start == endcol:
            # single column section — no merge
            sc = ws.cell(row=1, column=start, value=sec_name.split("—")[0].strip())
        else:
            ws.merge_cells(start_row=1, start_column=start, end_row=1, end_column=endcol)
            sc = ws.cell(row=1, column=start, value=sec_name.split("—")[0].strip())
        sc.font = _font(bold=True, color=C_WHITE, size=10)
        sc.fill = _fill(accent_dark)
        sc.alignment = _align(wrap=False, h="center")
        sc.border = border
    ws.row_dimensions[1].height = 28

    # ── Row 2: Headers ──────────────────────────────────────────────────────────
    header_to_col = {}   # header string → excel col idx
    for i, item in enumerate(col_list):
        ci = excel_cols[i]
        if item[0] == "divider":
            sec_name, fill_light, accent_dark = item[1], item[2], item[3]
            cell = ws.cell(row=2, column=ci, value="")
            cell.fill = _fill(accent_dark)
            cell.border = border
            ws.column_dimensions[get_column_letter(ci)].width = 1.5
        else:
            _, sec_name, fill_light, accent_dark, col = item
            header, hint, col_type, db_field = col
            display_header = _display_header(header)
            cell = ws.cell(row=2, column=ci, value=display_header)
            cell.font = _font(bold=True, color=C_WHITE, size=10)
            cell.fill = _fill(accent_dark)
            cell.alignment = _align(wrap=True, h="center")
            cell.border = border
            header_to_col[display_header] = ci
            header_to_col[header] = ci
    ws.row_dimensions[2].height = 40

    # ── Row 3: Hints ────────────────────────────────────────────────────────────
    for i, item in enumerate(col_list):
        ci = excel_cols[i]
        if item[0] == "divider":
            cell = ws.cell(row=3, column=ci, value="")
            cell.fill = _fill(item[3])
            cell.border = border
        else:
            _, sec_name, fill_light, accent_dark, col = item
            header, hint, col_type, db_field = col
            cell = ws.cell(row=3, column=ci, value=hint)
            cell.fill = _fill(fill_light)
            cell.font = _font(size=8, color=C_HINT_TEXT)
            cell.alignment = _align(wrap=True, h="left")
            cell.border = border
    ws.row_dimensions[3].height = 90

    # ── Rows 4–8: Example rows ───────────────────────────────────────────────────
    for ex_idx, example in enumerate(EXAMPLE_ROWS):
        row_idx = 4 + ex_idx
        for i, item in enumerate(col_list):
            ci = excel_cols[i]
            if item[0] == "divider":
                _, sec_name, fill_light, accent_dark = item[1], item[2], item[3], item[3]
                cell = ws.cell(row=row_idx, column=ci, value="")
                cell.fill = _fill(item[3])
                cell.border = border
            else:
                _, sec_name, fill_light, accent_dark, col = item
                header, hint, col_type, db_field = col
                val = _example_value(example, header)
                cell = ws.cell(row=row_idx, column=ci, value=val)
                cell.font = _font(size=9, color="595959", italic=True)
                cell.alignment = _align(wrap=False)
                cell.border = border
                if col_type == "D" and val:
                    cell.number_format = "DD-MMM-YYYY"

        # Scenario label in col A
        scen_cell = ws.cell(row=row_idx, column=1,
                            value=f"Example {ex_idx+1}: {example['scenario']}")
        scen_cell.font = _font(size=8, color="808080", italic=True)
        scen_cell.alignment = _align(wrap=True, h="left")
        ws.row_dimensions[row_idx].height = 22

    # Column A — scenario label column
    ws.column_dimensions["A"].width = 28
    ws.cell(row=1, column=1, value="").fill = _fill(C_NAVY)
    ws.cell(row=2, column=1, value="Scenario (example rows only)").font = _font(bold=True, color=C_WHITE, size=9)
    ws.cell(row=2, column=1).fill = _fill(C_NAVY)
    ws.cell(row=3, column=1, value="Delete these example rows before uploading. Your data starts at Row 4.").font = _font(size=8, italic=True, color="808080")
    for r in [1, 2, 3]:
        ws.cell(row=r, column=1).border = border

    # ── Freeze panes at D4 (after col A + first divider) ───────────────────────
    ws.freeze_panes = "D4"

    # ── Column widths for data columns ─────────────────────────────────────────
    custom_widths = {
        "Req ID": 14, "Position Title": 28, "Current Status": 16,
        "Candidate Name": 24, "Hiring Manager": 22, "Department": 20,
        "Location": 16, "Business Unit": 18, "Division": 18,
        "Band / Grade": 14, "Vertical": 16, "Zone": 14, "Priority": 12,
        "Job Type": 16, "Offered CTC (Lakhs)": 20, "CTC Budget (LPA)": 18,
        "Source Joiner Type": 28, "Source of Hire": 24, "Assigned Recruiter": 22,
        "Profiles Sourced": 16, "Profiles Submitted": 18, "Interviews Scheduled": 20,
        "Offers Released": 16, "Offers Accepted": 16, "Positions Open": 16,
        "Ageing Days": 14, "Ageing Bracket": 18, "TTO Days": 12, "TTF Days": 12,
        "Joining Date": 18, "Req Created Date": 18, "Mandate Received Date": 20,
        "First CV Share Date": 20, "Offered Date": 16, "Offer Accepted Date": 18,
        "Req Cancelled Date": 18, "LOI Date": 16, "Closure Date": 16,
        "Candidate Selection Date": 22,
    }
    for i, item in enumerate(col_list):
        ci = excel_cols[i]
        if item[0] == "data":
            header = item[4][0]
            w = custom_widths.get(header, 20)
            ws.column_dimensions[get_column_letter(ci)].width = w

    # ── Data validations ─────────────────────────────────────────────────────────
    ov = overrides or {}
    status_values = ov.get("pipeline_status_values")
    if status_values is None and ov.get("status_vocabulary"):
        status_values = list(ov["status_vocabulary"].keys())
    if status_values is None:
        status_values = ov.get("pipeline_status_values") or PIPELINE_STATUS_VALUES
    sjt_values = ov.get("source_joiner_values")
    if sjt_values is None and ov.get("valid_source_joiner_types"):
        sjt_values = [
            SOURCE_JOINER_DB_TO_LABEL.get(v, v)
            for v in ov["valid_source_joiner_types"]
            if v
        ]
    if sjt_values is None:
        sjt_values = SOURCE_JOINER_VALUES
    band_values = ov.get("valid_bands")
    dept_values = ov.get("valid_departments")
    loc_values = ov.get("valid_locations")

    for i, item in enumerate(col_list):
        ci = excel_cols[i]
        if item[0] != "data":
            continue
        header, hint, col_type, db_field = item[4]
        display_header = _display_header(header)
        if header == "Current Status":
            _make_dv(ws, status_values, ci,
                     "Client pipeline statuses from project config",
                     display_header)
        elif header == "Source Joiner Type":
            _make_dv(ws, [""] + list(sjt_values), ci,
                     "Taggd RPO / Taggd Direct / ER – Employee Referral / IJP / Campus / Internal Transfer",
                     "Source Joiner Type")
        elif header == "Ageing Bracket":
            _make_dv(ws, [""] + AGEING_BRACKET_VALUES, ci,
                     "0-2 weeks / 3-5 weeks / 6-9 weeks / Over 10 weeks / No data",
                     "Ageing Bracket")
        elif header == "Band / Grade" and band_values:
            _make_dv(ws, [""] + list(band_values), ci,
                     "Choose from configured bands for this client",
                     "Band / Grade")
        elif header == "Department" and dept_values:
            _make_dv(ws, [""] + list(dept_values), ci,
                     "Choose from configured departments for this client",
                     "Department")
        elif header == "Location" and loc_values:
            _make_dv(ws, [""] + list(loc_values), ci,
                     "Choose from configured locations for this client",
                     "Location")


# ─── SHEET 3: CONTRACTUAL ──────────────────────────────────────────────────────

def build_contractual_sheet(ws, overrides: dict | None = None) -> None:
    ws.title = "Contractual"
    ws.sheet_view.showGridLines = True
    ws.column_dimensions["A"].width = 2
    ov = overrides or {}
    fee_model = ov.get("fee_model") or {}

    def _cell(row, col, value, bold=False, size=10, color="000000", fill=None,
              wrap=True, h="left", italic=False):
        c = ws.cell(row=row, column=col, value=value)
        c.font = _font(bold=bold, color=color, size=size, italic=italic)
        c.alignment = _align(wrap=wrap, h=h)
        c.border = border
        if fill:
            c.fill = _fill(fill)
        return c

    # Title / intro
    ws.merge_cells("B1:E1")
    tc = ws.cell(row=1, column=2, value="Contractual Sheet — Fee Structure")
    tc.font = _font(bold=True, size=14, color=C_WHITE)
    tc.fill = _fill("203864")
    tc.alignment = _align(wrap=False, h="left")
    tc.border = border
    ws.row_dimensions[1].height = 32

    ws.merge_cells("B2:E2")
    ic = ws.cell(row=2, column=2,
                 value="Fill in the fee percentages agreed with the client. "
                       "The system reads this once when you upload — update only when the contract changes. "
                       "Use ONE ROW per fee band. Do not merge cells or use stacked headers.")
    ic.font = _font(size=10, italic=True, color="595959")
    ic.alignment = _align(wrap=True, h="left")
    ic.border = border
    ws.row_dimensions[2].height = 40

    ws.row_dimensions[3].height = 16  # spacer

    # Header row
    headers = ["CTC Band", "Opening Fee %", "Closing Fee %", "ER / IJP Flat Fee (₹)"]
    hints = [
        "Seniority or CTC range — e.g. All, Below 40 Lakhs, 40–80 Lakhs",
        "% of Offered CTC paid when position is opened. Enter as % (e.g. 1.10) or decimal (e.g. 0.011).",
        "% of Offered CTC paid when candidate joins. Enter as % (e.g. 2.40) or decimal (e.g. 0.024).",
        "Flat fee in Rupees per ER or IJP joiner. Enter as full INR (e.g. 1200). Enter 0 if not applicable.",
    ]
    for ci, (h, hint) in enumerate(zip(headers, hints), start=2):
        _cell(4, ci, h, bold=True, color=C_WHITE, fill="203864", h="center")
        ws.column_dimensions[get_column_letter(ci)].width = [28, 30, 30, 28][ci - 2]
        _cell(5, ci, hint, size=8, italic=True, fill=C_GOLD_LIGHT)
        ws.row_dimensions[5].height = 52

    ws.row_dimensions[4].height = 26

    # Example rows — pre-fill from fee_model when configured
    examples = [
        ["All joiners (CTC below 40 Lakhs)", "1.10%", "2.40%", "1200"],
        ["CTC 40 Lakhs and above",           "1.00%", "2.20%", "1200"],
    ]
    fee_type = str(fee_model.get("type") or "").strip().lower()
    if fee_type == "flat_fee":
        flat = fee_model.get("flat_fee_per_joiner") or 0
        examples = [
            ["All joiners", "0", "0", str(flat)],
        ]
    elif fee_type == "percentage":
        opening = fee_model.get("opening_fee_pct")
        closing = fee_model.get("closing_fee_pct")
        if opening is not None or closing is not None:
            def _pct_label(val):
                if val is None:
                    return "0"
                v = float(val)
                if v <= 1:
                    return f"{v * 100:.2f}%"
                return f"{v}%"

            examples = [
                [
                    "All joiners (from project config)",
                    _pct_label(opening),
                    _pct_label(closing),
                    "0",
                ],
            ]
    for ex_idx, ex in enumerate(examples):
        row_idx = 6 + ex_idx
        for ci, val in enumerate(ex, start=2):
            _cell(row_idx, ci, val, size=10, italic=True, color="595959")
        ws.row_dimensions[row_idx].height = 22

    # Warning
    ws.merge_cells("B9:E9")
    wc = ws.cell(row=9, column=2,
                 value="IMPORTANT: This sheet is read once per project. "
                       "If your contract terms change, upload the updated file and the system will regenerate "
                       "revenue calculations using the new rates.")
    wc.font = _font(bold=True, color="C00000", size=10)
    wc.fill = _fill("FFE0E0")
    wc.alignment = _align(wrap=True, h="left")
    wc.border = border
    ws.row_dimensions[9].height = 44

    # Fee formula explanation
    ws.merge_cells("B11:E11")
    fc = ws.cell(row=11, column=2, value="HOW THE FEE IS CALCULATED")
    fc.font = _font(bold=True, color=C_WHITE, size=11)
    fc.fill = _fill(C_NAVY)
    fc.alignment = _align(wrap=False, h="left")
    fc.border = border
    ws.row_dimensions[11].height = 26

    formula_rows = [
        ("Opening fee example",
         "Offered CTC = 45 Lakhs. Opening Fee % = 1.10%  →  45 × 1,00,000 × 0.011 = ₹49,500"),
        ("Closing fee example",
         "Offered CTC = 45 Lakhs. Closing Fee % = 2.40%  →  45 × 1,00,000 × 0.024 = ₹1,08,000"),
        ("ER / IJP flat fee example",
         "Source Joiner Type = ER. Flat fee = ₹1,200 per joiner  →  fee = ₹1,200 (regardless of CTC)"),
        ("Total fee for a Taggd RPO hire",
         "Opening fee (when position becomes Active) + Closing fee (when candidate Joins)"),
    ]
    for i, (label, detail) in enumerate(formula_rows):
        ri = 12 + i
        lc = ws.cell(row=ri, column=2, value=label)
        lc.font = _font(bold=True, size=10)
        lc.fill = _fill(C_GOLD_LIGHT)
        lc.alignment = _align(wrap=True)
        lc.border = border
        dc = ws.cell(row=ri, column=3)
        ws.merge_cells(f"C{ri}:E{ri}")
        dc = ws.cell(row=ri, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        ws.row_dimensions[ri].height = 36


# ─── SHEET 4: REFERENCE ───────────────────────────────────────────────────────

def build_reference_sheet(ws) -> None:
    ws.title = "Reference"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 55
    ws.column_dimensions["D"].width = 2

    def _heading(row, text, fill=C_NAVY, color=C_WHITE, size=12):
        ws.merge_cells(f"B{row}:C{row}")
        c = ws.cell(row=row, column=2, value=text)
        c.font = _font(bold=True, color=color, size=size)
        c.fill = _fill(fill)
        c.alignment = _align(wrap=False, h="left")
        c.border = border
        ws.row_dimensions[row].height = 26

    def _row2(row, label, detail, lf=None, df=None, lbold=True):
        lc = ws.cell(row=row, column=2, value=label)
        lc.font = _font(bold=lbold, size=10)
        lc.alignment = _align(wrap=True)
        lc.border = border
        if lf:
            lc.fill = _fill(lf)
        dc = ws.cell(row=row, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        if df:
            dc.fill = _fill(df)
        ws.row_dimensions[row].height = 40

    r = 2

    # ── Pipeline Status values ──
    _heading(r, "CURRENT STATUS — Allowed values and what they mean")
    r += 1
    status_rows = [
        ("Open",       "The position is live and being actively worked on. No offer has been made yet."),
        ("Screening",  "CVs are being reviewed and shortlisted."),
        ("Interview",  "Candidate is in the interview process."),
        ("Offered",    "An offer letter has been released to the candidate."),
        ("Joined",     "The candidate has officially joined on their first day. "
                       "The system will calculate the closing fee when Joining Date is filled."),
        ("On Hold",    "The position has been paused. Could re-activate later."),
        ("Rejected",   "The candidate was rejected (use Cancelled if the entire position is withdrawn)."),
        ("Cancelled",  "The position has been formally withdrawn by the client."),
        ("Closed",     "The position was closed without a placement (e.g. frozen, restructured)."),
    ]
    for label, detail in status_rows:
        _row2(r, label, detail)
        r += 1
    r += 1

    # ── Source Joiner Type values ──
    _heading(r, "SOURCE JOINER TYPE — Allowed values and fee route")
    r += 1
    sj_rows = [
        ("Taggd RPO",
         "Candidate was sourced through the Taggd RPO engagement. "
         "Fee = Opening % + Closing % of CTC (from Contractual sheet)."),
        ("Taggd Direct",
         "Candidate was placed directly by Taggd (non-RPO). "
         "Fee = Opening % + Closing % of CTC."),
        ("ER – Employee Referral",
         "Candidate was referred by a client employee. "
         "Fee = flat fee per joiner from Contractual sheet (NOT % of CTC)."),
        ("IJP – Internal Job Posting",
         "Candidate was hired through an internal job posting. "
         "Fee = flat fee per joiner from Contractual sheet."),
        ("Campus",
         "Candidate was hired through a campus drive. "
         "Fee calculation depends on your specific contract terms."),
        ("Internal Transfer",
         "Candidate moved from one business unit to another within the same organisation."),
    ]
    for label, detail in sj_rows:
        _row2(r, label, detail)
        r += 1
    r += 1

    # ── Ageing Bracket values ──
    _heading(r, "AGEING BRACKET — Allowed values")
    r += 1
    ab_rows = [
        ("0-2 weeks",     "Position has been open for 0–14 days."),
        ("3-5 weeks",     "Position has been open for 15–35 days."),
        ("6-9 weeks",     "Position has been open for 36–63 days."),
        ("Over 10 weeks", "Position has been open for more than 63 days — flagged as aged."),
        ("No data",       "Ageing information is not available."),
    ]
    for label, detail in ab_rows:
        _row2(r, label, detail)
        r += 1
    r += 1

    # ── Metrics impact table ──
    _heading(r, "WHAT EACH SECTION FEEDS IN THE PLATFORM")
    r += 1
    # subheader
    lh = ws.cell(row=r, column=2, value="Section")
    lh.font = _font(bold=True, size=10, color=C_WHITE)
    lh.fill = _fill("595959")
    lh.border = border
    dh = ws.cell(row=r, column=3, value="Dashboard / metric it drives")
    dh.font = _font(bold=True, size=10, color=C_WHITE)
    dh.fill = _fill("595959")
    dh.border = border
    ws.row_dimensions[r].height = 22
    r += 1

    metric_rows = [
        ("MUST FILL", C_RED_LIGHT,
         "Pipeline counts (Open, Offered, Joined, Cancelled) · Requisition KPIs · Portfolio status bands"),
        ("KEY DATES", C_GREEN_LIGHT,
         "Time-to-Fill (TTF) · Time-to-Offer (TTO) · Ageing days & brackets · SLA performance scores · Revenue trigger (Joining Date)"),
        ("CTC & REVENUE", C_GOLD_LIGHT,
         "Tracker-derived revenue (opening fee + closing fee) · Revenue dashboard · Budget waterfall · Portfolio Intelligence revenue score"),
        ("SOURCE JOINER TYPE", C_PURPLE_LIGHT,
         "RPO source-mix % · ER/IJP flat-fee calculation · CEO view RPH blend"),
        ("FUNNEL COUNTS", C_ORANGE_LIGHT,
         "Hit Ratio · First Time Right ratio · Offer Drop Rate · Offer Acceptance Rate · Monthly funnel charts"),
        ("ROLE DETAILS", C_BLUE_LIGHT,
         "Pipeline filters (dept, location, zone, BU) · Data quality score · Regional revenue charts"),
        ("TAGGD TEAM", C_TEAL_LIGHT,
         "Recruiter productivity · Account SPOC tracking · SLA attribution"),
    ]
    for sec_label, fill_c, detail in metric_rows:
        lc = ws.cell(row=r, column=2, value=sec_label)
        lc.font = _font(bold=True, size=10)
        lc.fill = _fill(fill_c)
        lc.alignment = _align(wrap=True)
        lc.border = border
        dc = ws.cell(row=r, column=3, value=detail)
        dc.font = _font(size=10)
        dc.alignment = _align(wrap=True)
        dc.border = border
        ws.row_dimensions[r].height = 44
        r += 1
    r += 1

    # ── Do not add these ──
    _heading(r, "DO NOT ADD THESE COLUMNS — They are generated automatically by the system")
    r += 1
    noadd_rows = [
        ("Global Status",    "Set automatically from Current Status + Joining Date + Revenue logic. Do not add this column."),
        ("Revenue",          "Calculated from Offered CTC × fee % in Contractual sheet. Do not add."),
        ("Opening Fee",      "Calculated by the system. Do not add."),
        ("Closing Fee",      "Calculated by the system. Do not add."),
        ("Fingerprint",      "System-generated row identity hash. Never visible to users."),
        ("Project ID",       "Assigned by the system from the filename match. Do not add."),
        ("Record ID / id",   "Auto-increment database key. Do not add."),
        ("Created At",       "System database timestamp. Do not add."),
    ]
    for label, detail in noadd_rows:
        _row2(r, label, detail, lf=C_GREY_LIGHT)
        r += 1


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def generate_tracker_workbook_bytes(overrides: dict | None = None) -> bytes:
    """Build the standard tracker workbook in memory; optional client-specific dropdown overrides."""
    import io

    wb = openpyxl.Workbook()
    default = wb.active
    wb.remove(default)

    build_readme_sheet(wb.create_sheet())
    build_tracker_sheet(wb.create_sheet(), overrides=overrides)
    build_contractual_sheet(wb.create_sheet(), overrides=overrides)
    build_reference_sheet(wb.create_sheet())

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def main() -> None:
    data = generate_tracker_workbook_bytes()
    with open(OUT_PATH, "wb") as f:
        f.write(data)
    total_data_cols = sum(1 for _, item in enumerate(FLAT_COLS))
    print(f"Template saved: {OUT_PATH}")
    print(f"  Tracker data columns: {total_data_cols}")
    print(f"  Example rows: {len(EXAMPLE_ROWS)}")
    print(f"  Sections: {len(SECTIONS)}")


if __name__ == "__main__":
    main()
