#!/usr/bin/env python3
"""
Ingest `MoM Tracker*.xlsx` (sheet `MoM`) into `platform_meetings` + `meeting_action_items`.

Resolves organizer / created-by / internal attendee emails to `users.id`; see `backend.core.mom_tracker_ingest`.

From repo root:
  python3 backend/scripts/ingest_mom_tracker_workbook.py actual_data/MoM\\ Tracker\\ \\(\\1\\).xlsx
  python3 backend/scripts/ingest_mom_tracker_workbook.py --dry-run actual_data/MoM\\ Tracker\\ \\(\\1\\).xlsx
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.mom_tracker_ingest import ingest_mom_workbook  # noqa: E402
from backend.db.database import SessionLocal, init_db  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Ingest MoM Tracker Excel into platform_meetings")
    p.add_argument("xlsx", help="Path to MoM Tracker .xlsx")
    p.add_argument("--dry-run", action="store_true", help="Parse rows only, do not write DB")
    args = p.parse_args()

    path = os.path.abspath(args.xlsx)
    if not os.path.isfile(path):
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    init_db()
    db = SessionLocal()
    try:
        out = ingest_mom_workbook(path, db, dry_run=args.dry_run)
    finally:
        db.close()

    if "error" in out:
        print(out["error"], file=sys.stderr)
        return 1

    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
