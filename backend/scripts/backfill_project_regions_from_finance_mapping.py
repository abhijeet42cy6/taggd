"""
One-off (or repeated) backfill: set Project.region and Project.sub_region from a finance
workbook's «Mapping» sheet only. No other Project fields are changed.

Usage (from repo root):
  python3 -m backend.scripts.backfill_project_regions_from_finance_mapping excel_files_imp/FY25-26_Finance\\ Data_new.xlsx
  python3 -m backend.scripts.backfill_project_regions_from_finance_mapping --dry-run path/to/file.xlsx
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.finance_mapping_regions import (  # noqa: E402
    apply_project_regions_from_finance_mapping_workbook,
    count_projects_missing_region,
)
from backend.db.database import SessionLocal, init_db  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill Project.region / sub_region from finance Mapping sheet.")
    ap.add_argument("workbook", help="Path to corporate finance master (.xlsx)")
    ap.add_argument("--dry-run", action="store_true", help="Compute stats but rollback (no DB writes)")
    args = ap.parse_args()

    path = os.path.abspath(args.workbook)
    if not os.path.isfile(path):
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    init_db()
    db = SessionLocal()
    try:
        before_unknown = count_projects_missing_region(db)
        stats = apply_project_regions_from_finance_mapping_workbook(db, path)
        if not stats.sheet_name:
            print("No «Mapping» sheet found (skipped). No changes.")
            return 0
        print(f"Sheet: {stats.sheet_name}")
        print(f"  Rows scanned: {stats.mapping_rows_scanned}")
        print(f"  Distinct account keys in sheet: {stats.distinct_accounts_in_sheet}")
        print(f"  Project rows updated (region and/or sub_region): {stats.project_rows_updated}")
        print(f"  Sheet accounts with no matching DB project: {stats.accounts_in_sheet_not_in_db}")
        print(f"  Projects with empty region (before): {before_unknown}")
        if args.dry_run:
            db.rollback()
            print("(dry-run — rolled back)")
        else:
            db.commit()
            after = count_projects_missing_region(db)
            print(f"  Projects with empty region (after): {after}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
