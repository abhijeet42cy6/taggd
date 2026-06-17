#!/usr/bin/env python3
"""
Generate Maruti Suzuki Test Tracker.xlsx — a small, predictable fixture for
Direct Upload / pipeline / revenue testing.

Usage (from revagent/):
  PYTHONPATH=. python3 excel_upload_masters/generate_maruti_test_tracker.py

Output:
  ../Maruti Suzuki Test Tracker.xlsx
  excel_files/Maruti Suzuki Test Tracker.xlsx
"""
from __future__ import annotations

import shutil
import sys
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "excel_upload_masters" / "taggd_standard_tracker_template.xlsx"
# Prefer client-configured template when present (e.g. two-band contractual).
CLIENT_TEMPLATE = ROOT.parent / "Maruti Suzuki Tracker (3).xlsx"
OUT_ROOT = ROOT.parent / "Maruti Suzuki Test Tracker.xlsx"
OUT_UPLOAD_NAME = ROOT.parent / "Maruti Suzuki Tracker.xlsx"
OUT_COPY = ROOT / "excel_files" / "Maruti Suzuki Test Tracker.xlsx"

DATA_START = 4
EXAMPLE_END = 8

# 28 rows — every Current Status + fee route + edge cases (Maruti-style org data)
ROWS: list[dict] = [
    # --- OPEN / PIPELINE (no offer yet) ---
    {
        "Req ID": "TEST-M01", "Position Title": "Senior Engineer – Powertrain", "Current Status": "Open",
        "Candidate Name": None, "Hiring Manager": "Rajesh Kumar", "Department": "PT-ENG",
        "Location": "Manesar", "Zone": "North", "Business Unit": "Powertrain", "Division": "Engineering",
        "Band / Grade": "E3", "Vertical": "Manufacturing", "Priority": "High", "Job Type": "New",
        "Req Created Date": date(2025, 10, 1), "Mandate Received Date": date(2025, 10, 5),
        "Intake Date": date(2025, 10, 7), "Assigned Recruiter": "Priya Sharma", "Sourcer": "Amit Verma",
        "Taggd PM": "Neha Gupta", "BHR / HRBP": "Suresh Patel", "Source Joiner Type": "Taggd RPO",
        "Source of Hire": "Taggd", "Profiles Sourced": 45, "Profiles Submitted": 12,
        "Interviews Scheduled": 0, "Positions Open": 1, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M02", "Position Title": "Manager – Quality Assurance", "Current Status": "Open",
        "Candidate Name": None, "Hiring Manager": "Anita Desai", "Department": "QA-MFG",
        "Location": "Gurgaon", "Business Unit": "Quality", "Division": "Manufacturing",
        "Band / Grade": "M2", "Vertical": "Quality", "Job Type": "Replacement",
        "Req Created Date": date(2025, 11, 15), "Mandate Received Date": date(2025, 11, 20),
        "Assigned Recruiter": "Rohit Singh", "Taggd PM": "Neha Gupta", "Source Joiner Type": "Taggd RPO",
        "Profiles Sourced": 30, "Profiles Submitted": 8, "Positions Open": 1, "FY Label": "FY2025-26",
    },
    # --- SCREENING ---
    {
        "Req ID": "TEST-M03", "Position Title": "Deputy Manager – Finance", "Current Status": "Screening",
        "Candidate Name": "Vikram Mehta", "Hiring Manager": "Deepak Joshi", "Department": "FIN-CORP",
        "Location": "Gurgaon", "Business Unit": "Finance", "Division": "Corporate",
        "Band / Grade": "DM1", "Job Type": "New",
        "Req Created Date": date(2025, 9, 1), "Mandate Received Date": date(2025, 9, 5),
        "First CV Share Date": date(2025, 9, 20), "Assigned Recruiter": "Priya Sharma",
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Profiles Sourced": 60, "Profiles Submitted": 18, "Interviews Scheduled": 0, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M04", "Position Title": "Engineer – Body Shop", "Current Status": "Screening",
        "Candidate Name": "Sanjay Reddy", "Location": "Manesar", "Department": "BODY",
        "Hiring Manager": "Kiran Malhotra", "Band / Grade": "E2", "Job Type": "New",
        "Req Created Date": date(2026, 1, 10), "Mandate Received Date": date(2026, 1, 12),
        "Assigned Recruiter": "Rohit Singh", "Source Joiner Type": "Taggd RPO",
        "Profiles Sourced": 25, "Profiles Submitted": 10, "FY Label": "FY2025-26",
    },
    # --- INTERVIEW ---
    {
        "Req ID": "TEST-M05", "Position Title": "AM – Vigilance / Security", "Current Status": "Interview",
        "Candidate Name": "Col. Raj Kumar Singh", "Hiring Manager": "Col. Raj Kumar Singh",
        "Department": "VGL-R", "Location": "Nagpur", "Business Unit": "PLSFHR", "Division": "VGLSCD",
        "Vertical": "Vigilance", "Band / Grade": "AM", "Job Type": "New",
        "Req Created Date": date(2025, 8, 1), "Mandate Received Date": date(2025, 8, 10),
        "First CV Share Date": date(2025, 8, 25), "Candidate Selection Date": date(2025, 10, 15),
        "Assigned Recruiter": "Priya Sharma", "Sourcer": "Amit Verma", "Taggd PM": "Neha Gupta",
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Profiles Sourced": 40, "Profiles Submitted": 15, "Interviews Scheduled": 3, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M06", "Position Title": "DM – Compliance", "Current Status": "Interview",
        "Candidate Name": "Nitin Singh", "Department": "I-COMP", "Location": "Gurgaon",
        "Hiring Manager": "Meera Iyer", "Band / Grade": "DM", "Job Type": "New",
        "Req Created Date": date(2025, 7, 1), "Mandate Received Date": date(2025, 7, 8),
        "First CV Share Date": date(2025, 7, 20),
        "Assigned Recruiter": "Rohit Singh", "Source Joiner Type": "Taggd RPO",
        "Profiles Sourced": 35, "Profiles Submitted": 12, "Interviews Scheduled": 2, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M25", "Position Title": "Graduate Engineer Trainee – Campus", "Current Status": "Interview",
        "Candidate Name": "Pooja Nair", "Department": "CAMPUS", "Location": "Manesar",
        "Hiring Manager": "HR Campus Team", "Band / Grade": "GET", "Job Type": "New",
        "Req Created Date": date(2025, 12, 1), "Source Joiner Type": "Campus", "Source of Hire": "Campus Drive",
        "Assigned Recruiter": "Campus Team", "Profiles Sourced": 200, "Profiles Submitted": 40,
        "Interviews Scheduled": 8, "FY Label": "FY2025-26",
    },
    # --- OFFERED (pipeline, not joined) ---
    {
        "Req ID": "TEST-M07", "Position Title": "Senior Manager – IT", "Current Status": "Offered",
        "Candidate Name": "Arun Khanna", "Department": "IT-APP", "Location": "Gurgaon",
        "Hiring Manager": "Sanjeev Rao", "Band / Grade": "SM", "Job Type": "New",
        "Req Created Date": date(2025, 6, 1), "Mandate Received Date": date(2025, 6, 8),
        "Offered Date": date(2026, 4, 1), "Offer Accepted Date": date(2026, 4, 5),
        "Offered CTC (Lakhs)": 18.0, "Assigned Recruiter": "Priya Sharma",
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Offers Released": 1, "Offers Accepted": 1, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M08", "Position Title": "Plant Head – Pune", "Current Status": "Offered",
        "Candidate Name": "Ravi Shankar", "Department": "PLANT", "Location": "Pune",
        "Hiring Manager": "Board Nominee", "Band / Grade": "PH", "Job Type": "Replacement",
        "Req Created Date": date(2025, 5, 1), "Offered Date": date(2026, 3, 15),
        "Offered CTC (Lakhs)": 45.0, "Source Joiner Type": "Taggd RPO",
        "Offers Released": 1, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M09", "Position Title": "Shift Incharge – Vigilance", "Current Status": "Offered",
        "Candidate Name": "Hemant Singh Thakur", "Department": "VGL-PK", "Location": "Manesar",
        "Band / Grade": "SI", "Job Type": "New",
        "Req Created Date": date(2025, 9, 15), "Offered Date": date(2026, 5, 1),
        "Offered CTC (Lakhs)": 12.0, "Source Joiner Type": "Taggd RPO",
        "Offers Released": 1, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M27", "Position Title": "Engineer – Paint Shop", "Current Status": "Offered",
        "Candidate Name": "Yet To Join Candidate", "Department": "PAINT", "Location": "Manesar",
        "Hiring Manager": "Ops Head", "Band / Grade": "E2", "Job Type": "New",
        "Req Created Date": date(2026, 2, 1), "Offered Date": date(2026, 5, 15),
        "Offer Accepted Date": date(2026, 5, 20), "Joining Date": date(2026, 8, 1),
        "Offered CTC (Lakhs)": 11.0, "Source Joiner Type": "Taggd RPO",
        "Offers Released": 1, "Offers Accepted": 1, "FY Label": "FY2025-26",
    },
    # --- JOINED — Taggd RPO/Direct (% fee) ---
    {
        "Req ID": "TEST-M10", "Position Title": "DM – Land Acquisition", "Current Status": "Joined",
        "Candidate Name": "Jigar Desai", "Department": "RLT-GJ", "Location": "Ahmedabad",
        "Hiring Manager": "Legal Head", "Band / Grade": "DM", "Job Type": "New",
        "Req Created Date": date(2024, 11, 1), "Mandate Received Date": date(2024, 11, 15),
        "Offered Date": date(2025, 3, 1), "Joining Date": date(2025, 4, 1),
        "Offered CTC (Lakhs)": 15.0, "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Assigned Recruiter": "Priya Sharma", "Taggd PM": "Neha Gupta", "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M11", "Position Title": "Manager – Supply Chain", "Current Status": "Joined",
        "Candidate Name": "Manish Agarwal", "Department": "SCM", "Location": "Manesar",
        "Band / Grade": "M1", "Job Type": "Replacement",
        "Req Created Date": date(2024, 12, 1), "Offered Date": date(2025, 5, 1),
        "Joining Date": date(2025, 6, 1), "Offered CTC (Lakhs)": 20.0,
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Assigned Recruiter": "Rohit Singh", "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M12", "Position Title": "Senior Engineer – Chassis", "Current Status": "Joined",
        "Candidate Name": "Karthik Menon", "Department": "CHASSIS", "Location": "Manesar",
        "Band / Grade": "E4", "Job Type": "New",
        "Req Created Date": date(2025, 1, 15), "Joining Date": date(2025, 4, 15),
        "Offered CTC (Lakhs)": 14.5, "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M13", "Position Title": "Head – Digital Manufacturing", "Current Status": "Joined",
        "Candidate Name": "Dr. Ananya Bose", "Department": "DIGI-MFG", "Location": "Gurgaon",
        "Band / Grade": "H1", "Job Type": "New",
        "Req Created Date": date(2024, 8, 1), "Offered Date": date(2025, 1, 10),
        "Joining Date": date(2025, 3, 1), "Offered CTC (Lakhs)": 25.0,
        "Source Joiner Type": "Taggd Direct", "Source of Hire": "Taggd Direct",
        "Assigned Recruiter": "Priya Sharma", "FY Label": "FY2024-25",
    },
    # --- JOINED — flat fee routes ---
    {
        "Req ID": "TEST-M14", "Position Title": "Executive – Admin", "Current Status": "Joined",
        "Candidate Name": "Referred Employee Hire", "Department": "ADMIN", "Location": "Gurgaon",
        "Band / Grade": "E1", "Job Type": "New",
        "Req Created Date": date(2025, 2, 1), "Joining Date": date(2025, 5, 1),
        "Offered CTC (Lakhs)": 12.0, "Source Joiner Type": "ER – Employee Referral",
        "Source of Hire": "ER", "IJP / Referral": "ER", "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M15", "Position Title": "Officer – HR Operations", "Current Status": "Joined",
        "Candidate Name": "Internal Promote Hire", "Department": "HR-OPS", "Location": "Manesar",
        "Band / Grade": "O2", "Job Type": "Replacement",
        "Req Created Date": date(2025, 3, 1), "Joining Date": date(2025, 6, 1),
        "Offered CTC (Lakhs)": 10.0, "Source Joiner Type": "IJP – Internal Job Posting",
        "Source of Hire": "IJP", "IJP / Referral": "IJP", "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M26", "Position Title": "Specialist – Internal Move", "Current Status": "Joined",
        "Candidate Name": "Transfer Hire", "Department": "SHARED-SVC", "Location": "Pune",
        "Band / Grade": "SP", "Job Type": "Replacement",
        "Req Created Date": date(2025, 4, 1), "Joining Date": date(2025, 7, 1),
        "Offered CTC (Lakhs)": 13.0, "Source Joiner Type": "Internal Transfer",
        "Source of Hire": "Internal Transfer", "FY Label": "FY2024-25",
    },
    # --- JOINED edge cases ---
    {
        "Req ID": "TEST-M16", "Position Title": "Technician – Maintenance", "Current Status": "Joined",
        "Candidate Name": "Missing CTC Joiner", "Department": "MAINT", "Location": "Manesar",
        "Band / Grade": "T1", "Job Type": "New",
        "Req Created Date": date(2025, 1, 1), "Joining Date": date(2025, 8, 1),
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M17", "Position Title": "Analyst – Business Planning", "Current Status": "Joined",
        "Candidate Name": "No Join Date Joiner", "Department": "BP", "Location": "Gurgaon",
        "Band / Grade": "A1", "Job Type": "New",
        "Req Created Date": date(2025, 5, 1), "Offered CTC (Lakhs)": 9.0,
        "Source Joiner Type": "Taggd RPO",
        "FY Label": "FY2025-26",
    },
    # --- ON HOLD ---
    {
        "Req ID": "TEST-M18", "Position Title": "Consultant – R&D", "Current Status": "On Hold",
        "Candidate Name": None, "Department": "RND", "Location": "Manesar",
        "Hiring Manager": "Chief Scientist", "Band / Grade": "C1", "Job Type": "New",
        "Req Created Date": date(2025, 4, 1), "Mandate Received Date": date(2025, 4, 10),
        "Assigned Recruiter": "Priya Sharma", "Source Joiner Type": "Taggd RPO",
        "Current Stage": "Budget hold", "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M19", "Position Title": "Manager – Exports", "Current Status": "On Hold",
        "Candidate Name": "Shortlisted Candidate", "Department": "EXPORT", "Location": "Gurgaon",
        "Band / Grade": "M1", "Job Type": "New",
        "Req Created Date": date(2025, 6, 1), "Source Joiner Type": "Taggd RPO",
        "FY Label": "FY2025-26",
    },
    # --- CANCELLED / REJECTED / CLOSED ---
    {
        "Req ID": "TEST-M20", "Position Title": "Lead – After Sales", "Current Status": "Cancelled",
        "Candidate Name": None, "Department": "AFTERSALES", "Location": "Delhi NCR",
        "Band / Grade": "L1", "Job Type": "New",
        "Req Created Date": date(2025, 3, 15), "Req Cancelled Date": date(2025, 8, 1),
        "Source Joiner Type": "Taggd RPO", "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M21", "Position Title": "Supervisor – Logistics", "Current Status": "Cancelled",
        "Candidate Name": "Dropped Candidate", "Department": "LOG", "Location": "Manesar",
        "Band / Grade": "S1", "Job Type": "Replacement",
        "Req Created Date": date(2025, 7, 1), "Req Cancelled Date": date(2026, 1, 15),
        "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M22", "Position Title": "Engineer – Testing", "Current Status": "Rejected",
        "Candidate Name": "Failed Interview", "Department": "TEST", "Location": "Manesar",
        "Band / Grade": "E2", "Job Type": "New",
        "Req Created Date": date(2026, 2, 15), "First CV Share Date": date(2026, 3, 1),
        "Source Joiner Type": "Taggd RPO", "Profiles Sourced": 20, "Profiles Submitted": 5,
        "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M23", "Position Title": "Role – Discontinued", "Current Status": "Closed",
        "Candidate Name": None, "Department": "N/A", "Location": "Gurgaon",
        "Job Type": "New", "Req Created Date": date(2024, 6, 1),
        "Closure Date": date(2024, 12, 31), "FY Label": "FY2024-25",
    },
    # --- AGEING / MISSING SOURCE ---
    {
        "Req ID": "TEST-M24", "Position Title": "Senior Manager – Procurement", "Current Status": "Open",
        "Candidate Name": None, "Department": "PROC", "Location": "Gurgaon",
        "Hiring Manager": "CPO Office", "Band / Grade": "SM", "Job Type": "New",
        "Req Created Date": date(2024, 1, 1), "Mandate Received Date": date(2024, 1, 15),
        "Assigned Recruiter": "Rohit Singh", "Source Joiner Type": "Taggd RPO",
        "Profiles Sourced": 80, "Positions Open": 1, "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M28", "Position Title": "Coordinator – Training", "Current Status": "Screening",
        "Candidate Name": "Unknown Source Cand", "Department": "TRG", "Location": "Manesar",
        "Band / Grade": "C1", "Job Type": "New",
        "Req Created Date": date(2026, 3, 1),
        "Profiles Sourced": 10, "Profiles Submitted": 4, "FY Label": "FY2025-26",
    },
    # --- CTC tier 40L+ (second contractual band) ---
    {
        "Req ID": "TEST-M29", "Position Title": "VP – Corporate Strategy", "Current Status": "Joined",
        "Candidate Name": "High CTC Joiner", "Department": "STRAT", "Location": "Gurgaon",
        "Hiring Manager": "CEO Office", "Band / Grade": "VP", "Job Type": "New",
        "Req Created Date": date(2024, 9, 1), "Offered Date": date(2025, 2, 1),
        "Joining Date": date(2025, 3, 15), "Offered CTC (Lakhs)": 52.0,
        "Source Joiner Type": "Taggd RPO", "Source of Hire": "Taggd",
        "Billing Month": "Mar-2025", "FY Label": "FY2024-25",
    },
    {
        "Req ID": "TEST-M30", "Position Title": "Director – EV Programs", "Current Status": "Offered",
        "Candidate Name": "Premium Offer Pending", "Department": "EV", "Location": "Manesar",
        "Band / Grade": "D1", "Job Type": "New",
        "Req Created Date": date(2025, 11, 1), "Offered Date": date(2026, 4, 10),
        "Offer Accepted Date": date(2026, 4, 15), "Offered CTC (Lakhs)": 48.0,
        "Source Joiner Type": "Taggd RPO", "Offers Released": 1, "Offers Accepted": 1,
        "FY Label": "FY2025-26",
    },
    # --- Campus joined (flat / alternate fee route) ---
    {
        "Req ID": "TEST-M31", "Position Title": "GET – Manufacturing", "Current Status": "Joined",
        "Candidate Name": "Campus Joiner", "Department": "MFG", "Location": "Manesar",
        "Band / Grade": "GET", "Job Type": "New",
        "Req Created Date": date(2025, 1, 1), "Joining Date": date(2025, 7, 1),
        "Offered CTC (Lakhs)": 8.5, "Source Joiner Type": "Campus", "Source of Hire": "Campus Drive",
        "FY Label": "FY2025-26",
    },
    # --- Ageing bracket samples ---
    {
        "Req ID": "TEST-M32", "Position Title": "AM – Procurement", "Current Status": "Open",
        "Candidate Name": None, "Department": "PROC", "Location": "Gurgaon",
        "Band / Grade": "AM", "Job Type": "New",
        "Req Created Date": date(2025, 12, 1), "Mandate Received Date": date(2025, 12, 5),
        "Ageing Days": 45, "Ageing Bracket": "6-9 weeks",
        "Source Joiner Type": "Taggd RPO", "Positions Open": 1, "FY Label": "FY2025-26",
    },
    {
        "Req ID": "TEST-M33", "Position Title": "Engineer – Stamping", "Current Status": "Interview",
        "Candidate Name": "Long Cycle Cand", "Department": "STAMP", "Location": "Manesar",
        "Band / Grade": "E2", "Job Type": "New",
        "Req Created Date": date(2025, 8, 1), "First CV Share Date": date(2025, 8, 20),
        "Ageing Days": 120, "Ageing Bracket": "Over 10 weeks",
        "Source Joiner Type": "Taggd RPO", "Interviews Scheduled": 2, "FY Label": "FY2025-26",
    },
]


def _header_map(ws) -> dict[str, int]:
    out: dict[str, int] = {}
    for col in range(2, ws.max_column + 1):
        h = ws.cell(2, col).value
        if h and h != "Scenario (example rows only)":
            out[str(h)] = col
    return out


def _clear_examples(ws) -> None:
    for row in range(DATA_START, EXAMPLE_END + 1):
        for col in range(1, ws.max_column + 1):
            ws.cell(row, col).value = None


def _write_contractual(wb) -> None:
    """Ensure two-band Maruti-style contractual rows (skip merged cells)."""
    ws = wb["Contractual"]
    rows = [
        (6, "All joiners (CTC below 40 Lakhs)", "1.10%", "2.40%", 1200),
        (7, "CTC 40 Lakhs and above", "1.00%", "2.20%", 1200),
    ]
    for r, band, open_pct, close_pct, flat in rows:
        for c, val in enumerate([band, open_pct, close_pct, flat], start=2):
            cell = ws.cell(r, c)
            if type(cell).__name__ != "MergedCell":
                cell.value = val


def _scenario_label(row: dict) -> str:
    status = row.get("Current Status") or "?"
    sjt = row.get("Source Joiner Type") or "no SJT"
    return f"TEST: {status} · {sjt}"


def generate() -> Path:
    src = CLIENT_TEMPLATE if CLIENT_TEMPLATE.exists() else TEMPLATE
    if not src.exists():
        raise FileNotFoundError(f"Missing template: {src}")

    wb = openpyxl.load_workbook(src)
    ws = wb["Position Tracker"]
    headers = _header_map(ws)
    _clear_examples(ws)

    for idx, row in enumerate(ROWS):
        excel_row = DATA_START + idx
        ws.cell(excel_row, 1).value = _scenario_label(row)
        for key, col in headers.items():
            val = row.get(key)
            if val is not None:
                ws.cell(excel_row, col).value = val

    _write_contractual(wb)
    OUT_ROOT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_ROOT)
    shutil.copy2(OUT_ROOT, OUT_UPLOAD_NAME)
    OUT_COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_ROOT, OUT_COPY)
    print(f"Wrote {len(ROWS)} test rows → {OUT_ROOT}")
    print(f"Upload as → {OUT_UPLOAD_NAME}")
    print(f"Copy → {OUT_COPY}")
    _print_coverage()
    return OUT_ROOT


def _print_coverage() -> None:
    statuses = sorted({r["Current Status"] for r in ROWS})
    sjts = sorted({r.get("Source Joiner Type") for r in ROWS if r.get("Source Joiner Type")})
    print("\nCoverage:")
    print("  Statuses:", ", ".join(statuses))
    print("  Source joiner types:", ", ".join(sjts))
    print("  Rows:", len(ROWS))


if __name__ == "__main__":
    generate()
