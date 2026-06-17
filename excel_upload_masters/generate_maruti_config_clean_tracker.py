#!/usr/bin/env python3
"""
Generate Maruti Suzuki Tracker — Config Clean.xlsx

Aligned to a typical Maruti project tracker_config:
  valid_bands: A, B, C
  valid_departments: Finance, Manufacturing
  valid_locations: Gurgaon
  valid_source_joiner_types: all six standard types
  required_fields: joining_date, offered_ctc, status, candidate_name

Usage (from revagent/):
  PYTHONPATH=. python3 excel_upload_masters/generate_maruti_config_clean_tracker.py
"""
from __future__ import annotations

import importlib.util
import shutil
import sys
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
CLIENT_TEMPLATE = ROOT.parent / "Maruti Suzuki Tracker (3).xlsx"
TEMPLATE = ROOT / "excel_upload_masters" / "taggd_standard_tracker_template.xlsx"
OUT_NAME = "Maruti Suzuki Tracker - Ready.xlsx"
OUT_ROOT = ROOT.parent / OUT_NAME
OUT_ALT = ROOT.parent / "Maruti Suzuki Tracker - Clean.xlsx"
OUT_COPY = ROOT / "excel_files" / OUT_NAME

DATA_START = 4

VALID_BANDS = ["A", "B", "C"]
VALID_DEPTS = ["Finance", "Manufacturing"]
VALID_LOCATION = "Gurgaon"

# Load ROWS from the comprehensive test generator
_spec = importlib.util.spec_from_file_location(
    "maruti_test",
    ROOT / "excel_upload_masters" / "generate_maruti_test_tracker.py",
)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(_mod)
SOURCE_ROWS: list[dict] = list(_mod.ROWS)


def _ensure_sjt(row: dict) -> None:
    if not row.get("Source Joiner Type"):
        row["Source Joiner Type"] = "Taggd RPO"


def _ensure_candidate_name(row: dict) -> None:
    if row.get("Candidate Name"):
        return
    req = row.get("Req ID") or "REQ"
    status = row.get("Current Status") or "Open"
    if status == "Open":
        row["Candidate Name"] = f"Open — {req}"
    elif status in ("Cancelled", "Closed", "On Hold"):
        row["Candidate Name"] = f"N/A — {req}"
    else:
        row["Candidate Name"] = f"TBD — {req}"


def _ensure_required_fields(row: dict) -> None:
    """Fill required_fields so validate dry-run passes (joining_date, offered_ctc, status)."""
    status = row.get("Current Status") or "Open"
    # status comes from Current Status column → mapped to universal `status` on ingest

    if row.get("Offered CTC (Lakhs)") is None:
        if status in ("Joined", "Offered"):
            row["Offered CTC (Lakhs)"] = 12.0
        else:
            row["Offered CTC (Lakhs)"] = 0
    elif status == "Joined" and row.get("Offered CTC (Lakhs)") == 0:
        # Joined rows need positive CTC for revenue (avoids CLOSED-row warning)
        row["Offered CTC (Lakhs)"] = 12.0

    if not row.get("Joining Date"):
        if status == "Joined":
            row["Joining Date"] = row.get("Offered Date") or date(2025, 6, 1)
        elif status == "Offered":
            row["Joining Date"] = row.get("Offer Accepted Date") or row.get("Offered Date") or date(2026, 7, 1)
        else:
            # Pipeline / terminal rows — use req created so strict required_fields passes.
            # Not a real join; metrics for TTO/YTJ should use global_status, not this date alone.
            row["Joining Date"] = row.get("Req Created Date") or date(2026, 1, 1)


def clean_row(raw: dict, idx: int) -> dict:
    row = dict(raw)
    row["Band / Grade"] = VALID_BANDS[idx % len(VALID_BANDS)]
    row["Department"] = VALID_DEPTS[idx % len(VALID_DEPTS)]
    row["Location"] = VALID_LOCATION
    _ensure_sjt(row)
    _ensure_candidate_name(row)
    _ensure_required_fields(row)
    return row


def _header_map(ws) -> dict[str, int]:
    out: dict[str, int] = {}
    for col in range(2, ws.max_column + 1):
        h = ws.cell(2, col).value
        if h and h != "Scenario (example rows only)":
            out[str(h)] = col
    return out


def _clear_data_area(ws, from_row: int, to_row: int) -> None:
    for row in range(from_row, to_row + 1):
        for col in range(1, ws.max_column + 1):
            cell = ws.cell(row, col)
            if type(cell).__name__ != "MergedCell":
                cell.value = None


def _write_contractual(wb) -> None:
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


def generate() -> Path:
    src = CLIENT_TEMPLATE if CLIENT_TEMPLATE.exists() else TEMPLATE
    if not src.exists():
        raise FileNotFoundError(f"Missing template: {src}")

    rows = [clean_row(r, i) for i, r in enumerate(SOURCE_ROWS)]

    wb = openpyxl.load_workbook(src)
    ws = wb["Position Tracker"]
    headers = _header_map(ws)
    _clear_data_area(ws, DATA_START, DATA_START + len(rows) + 5)

    for idx, row in enumerate(rows):
        excel_row = DATA_START + idx
        ws.cell(excel_row, 1).value = f"CLEAN: {row.get('Current Status')} · {row.get('Source Joiner Type', 'Taggd RPO')}"
        for key, col in headers.items():
            val = row.get(key)
            if val is not None:
                ws.cell(excel_row, col).value = val

    _write_contractual(wb)
    OUT_ROOT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_ROOT)
    OUT_COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT_ROOT, OUT_COPY)
    shutil.copy2(OUT_ROOT, OUT_ALT)
    print(f"Wrote {len(rows)} ready-to-upload rows → {OUT_ROOT}")
    print(f"Also → {OUT_ALT}")
    print(f"Copy → {OUT_COPY}")
    return OUT_ROOT


if __name__ == "__main__":
    generate()
