"""
Merge duplicate `projects` rows that differ only by case/whitespace (e.g. TATA Power vs Tata Power).

Reassigns all FKs to the keeper project (lowest id), runs finance dedupe, deletes duplicates.

Usage (from repo root):
  PYTHONPATH=. python backend/scripts/merge_duplicate_projects.py --dry-run
  PYTHONPATH=. python backend/scripts/merge_duplicate_projects.py --execute
"""

from __future__ import annotations

import argparse
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import text

from backend.db.database import SessionLocal, Project, init_db
from backend.db.finance_dedupe import dedupe_finance_tables

FK_TABLES = [
    "records",
    "project_budgets",
    "project_forecasts",
    "metric_definitions",
    "sla_performances",
    "wfm_hr_benchmarks",
    "wfm_resource_gaps",
    "finance_monthly_ledger",
    "finance_cash_flow",
    "finance_efficiency_kpis",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Apply changes (default is dry-run)")
    args = parser.parse_args()
    dry = not args.execute

    init_db()
    db = SessionLocal()
    try:
        rows = db.query(Project.id, Project.account_name).all()
        by_key: dict[str, list[tuple[int, str]]] = {}
        for pid, name in rows:
            if name is None:
                key = ""
            else:
                key = " ".join(str(name).strip().split()).lower()
            by_key.setdefault(key, []).append((pid, str(name or "")))

        dup_groups = {k: v for k, v in by_key.items() if len(v) > 1 and k != ""}
        print(f"Duplicate name groups (non-empty): {len(dup_groups)}")
        for key, plist in sorted(dup_groups.items(), key=lambda x: -len(x[1])):
            ids = [p[0] for p in plist]
            keeper = min(ids)
            others = [i for i in ids if i != keeper]
            print(f"  {key!r}: ids={ids} -> keep {keeper}, merge {others}")

        if dry:
            print("\nDry-run only. Pass --execute to apply.")
            return

        for key, plist in dup_groups.items():
            ids = [p[0] for p in plist]
            keeper = min(ids)
            others = [i for i in ids if i != keeper]
            for oid in others:
                for table in FK_TABLES:
                    db.execute(text(f"UPDATE {table} SET project_id = :k WHERE project_id = :o"), {"k": keeper, "o": oid})
                db.execute(text("DELETE FROM projects WHERE id = :o"), {"o": oid})
            db.flush()

        dedupe_finance_tables(db)
        db.commit()
        print("\nMerge complete; finance dedupe applied.")
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
