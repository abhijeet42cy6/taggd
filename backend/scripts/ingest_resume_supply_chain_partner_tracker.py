"""
Ingest *Resume Supply Chain Partner* / *JOB BOARD / VENDOR LICENSE TRACKER* workbooks
into `resume_supplier_licenses` (same table as **Vendor licenses** in the app).

The workbook must contain a *Job Board Tracker* sheet with a header row including
*Job Board / Vendor* and *Cost (INR*...)*. Data rows are keyed by a numeric ``#`` column;
TOTAL / legend rows are ignored.

From repo root:
  python3 backend/scripts/ingest_resume_supply_chain_partner_tracker.py \\
    "excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx"

  # Replace all DB rows for the workbook FY, then load (clean mirror of the sheet)
  python3 backend/scripts/ingest_resume_supply_chain_partner_tracker.py \\
    "excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx" --replace-fy

  python3 ... path.xlsx --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.resume_supply_chain_tracker_xlsx import ingest_workbook  # noqa: E402
from backend.db.database import SessionLocal, init_db  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest vendor license / job board tracker xlsx")
    ap.add_argument("workbook", help="Path to Resume Supply Chain Partner / Job Board Tracker .xlsx")
    ap.add_argument(
        "--replace-fy",
        action="store_true",
        help="Delete all resume_supplier_licenses for the workbook's FY, then insert (full replace for that FY).",
    )
    ap.add_argument("--dry-run", action="store_true", help="Parse only; do not write the database.")
    args = ap.parse_args()
    init_db()
    path = os.path.abspath(args.workbook)
    if not os.path.isfile(path):
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)
    db = SessionLocal()
    try:
        out = ingest_workbook(
            path,
            db,
            user_id=None,
            dry_run=args.dry_run,
            replace_fy=args.replace_fy,
        )
        print(out)
    finally:
        db.close()


if __name__ == "__main__":
    main()
