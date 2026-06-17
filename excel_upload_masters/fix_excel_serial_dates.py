#!/usr/bin/env python3
"""
Convert Excel serial numbers in date columns to real dates.

Only changes cells whose value is an Excel date serial (integer/float > 40000).
All other cell values are left untouched.

Usage (from revagent/):
  PYTHONPATH=. python3 excel_upload_masters/fix_excel_serial_dates.py [path.xlsx]
"""
from __future__ import annotations

import datetime as dt
import shutil
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
TAGGD_ROOT = ROOT.parent
DEFAULT_TARGET = TAGGD_ROOT / "project_1_tracker_template (1).xlsx"
OUT_COPY = TAGGD_ROOT / "Maruti Suzuki Tracker - Patched.xlsx"
OUT_REPO = ROOT / "excel_files" / "Maruti Suzuki Tracker - Patched.xlsx"

DATA_START = 4
SERIAL_MIN = 40000
SERIAL_MAX = 60000  # ~year 2064; avoids touching CTC-like numbers


def _is_excel_serial(val) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return False
    if isinstance(val, (int,)):
        return SERIAL_MIN < val < SERIAL_MAX
    if isinstance(val, float):
        if val != val:  # NaN
            return False
        return SERIAL_MIN < val < SERIAL_MAX and abs(val - round(val)) < 1e-9
    s = str(val).strip()
    if s.replace(".", "", 1).isdigit():
        n = float(s)
        return SERIAL_MIN < n < SERIAL_MAX
    return False


def _serial_to_date(val) -> dt.date:
    return dt.date(1899, 12, 30) + dt.timedelta(days=int(float(val)))


def _header_map(ws) -> dict[str, int]:
    cols: dict[str, int] = {}
    for col in range(1, ws.max_column + 1):
        h = ws.cell(2, col).value
        if h:
            cols[str(h)] = col
    return cols


def _date_column_names(headers: dict[str, int]) -> list[str]:
    return [n for n in headers if "Date" in n or n == "Closure Date"]


def fix_workbook(path: Path) -> int:
    wb = openpyxl.load_workbook(path)
    ws = wb["Position Tracker"]
    headers = _header_map(ws)
    req_col = headers.get("Req ID", 2)
    date_names = _date_column_names(headers)
    fixed = 0
    details: list[str] = []

    for row in range(DATA_START, ws.max_row + 1):
        req_id = ws.cell(row, req_col).value
        for col_name in date_names:
            col_idx = headers[col_name]
            cell = ws.cell(row, col_idx)
            if type(cell).__name__ == "MergedCell":
                continue
            val = cell.value
            if _is_excel_serial(val):
                new_date = _serial_to_date(val)
                cell.value = new_date
                cell.number_format = "DD-MMM-YYYY"
                fixed += 1
                if len(details) < 8:
                    details.append(
                        f"  row {row} {req_id} | {col_name}: {val} -> {new_date.strftime('%d-%b-%Y')}"
                    )

    wb.save(path)
    if path.resolve() != OUT_COPY.resolve():
        shutil.copy2(path, OUT_COPY)
    OUT_REPO.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, OUT_REPO)

    print(f"Fixed {fixed} Excel serial date cells in {path}")
    for d in details:
        print(d)
    if fixed > len(details):
        print(f"  ... +{fixed - len(details)} more")
    print(f"Copy -> {OUT_COPY}")
    return fixed


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET
    if not target.exists():
        raise SystemExit(f"File not found: {target}")
    fix_workbook(target)
