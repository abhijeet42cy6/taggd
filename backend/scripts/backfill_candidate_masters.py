#!/usr/bin/env python3
"""CLI: idempotent backfill of candidate_masters + links (uses DATABASE_URL / sqlite default)."""

from __future__ import annotations

import argparse
import os
import sys

# Ensure repo root on path when run as file
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.db.database import SessionLocal, init_db
from backend.core.candidate_master_mgmt import backfill_candidate_masters


def main() -> None:
    p = argparse.ArgumentParser(description="Backfill candidate_masters from existing candidates rows.")
    p.add_argument("--dry-run", action="store_true", help="Count only; no DB writes.")
    p.add_argument("--limit", type=int, default=None, help="Max candidates to process.")
    p.add_argument("--batch-tag", type=str, default="cli", help="migration_batch_tag on new masters.")
    p.add_argument("--init-db", action="store_true", help="Run init_db() first (creates missing tables).")
    args = p.parse_args()
    if args.init_db:
        init_db()
    db = SessionLocal()
    try:
        stats = backfill_candidate_masters(
            db,
            migration_batch_tag=args.batch_tag,
            dry_run=args.dry_run,
            limit=args.limit,
        )
        print(stats)
    finally:
        db.close()


if __name__ == "__main__":
    main()
