#!/usr/bin/env python3
"""
Clear hierarchy_tag_sbu on clients and projects when it duplicates geographic sub_region.

Run from repo root:
  python3 backend/scripts/backfill_clear_geo_hierarchy_tag_sbu.py
  python3 backend/scripts/backfill_clear_geo_hierarchy_tag_sbu.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import text

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.database import SessionLocal, init_db  # noqa: E402


def run(*, dry_run: bool = False) -> dict[str, int]:
    init_db()
    db = SessionLocal()
    stats = {"projects_cleared": 0, "clients_cleared": 0}
    try:
        proj_rows = db.execute(
            text(
                """
                SELECT id, account_name, hierarchy_tag_sbu, sub_region
                FROM projects
                WHERE TRIM(COALESCE(hierarchy_tag_sbu, '')) != ''
                  AND TRIM(COALESCE(sub_region, '')) != ''
                  AND TRIM(hierarchy_tag_sbu) = TRIM(sub_region)
                """
            )
        ).fetchall()

        client_rows = db.execute(
            text(
                """
                SELECT c.id, c.official_name, c.hierarchy_tag_sbu
                FROM clients c
                WHERE TRIM(COALESCE(c.hierarchy_tag_sbu, '')) != ''
                  AND EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.client_id = c.id
                      AND TRIM(COALESCE(p.sub_region, '')) != ''
                      AND TRIM(c.hierarchy_tag_sbu) = TRIM(p.sub_region)
                  )
                """
            )
        ).fetchall()

        stats["projects_cleared"] = len(proj_rows)
        stats["clients_cleared"] = len(client_rows)

        if dry_run:
            print(f"[dry-run] Would clear hierarchy_tag_sbu on {len(proj_rows)} projects")
            for r in proj_rows[:10]:
                print(f"  project {r.id} {r.account_name!r}: {r.hierarchy_tag_sbu!r}")
            if len(proj_rows) > 10:
                print(f"  ... and {len(proj_rows) - 10} more")
            print(f"[dry-run] Would clear hierarchy_tag_sbu on {len(client_rows)} clients")
            for r in client_rows[:10]:
                print(f"  client {r.id} {r.official_name!r}: {r.hierarchy_tag_sbu!r}")
            if len(client_rows) > 10:
                print(f"  ... and {len(client_rows) - 10} more")
            return stats

        db.execute(
            text(
                """
                UPDATE projects
                SET hierarchy_tag_sbu = NULL
                WHERE TRIM(COALESCE(hierarchy_tag_sbu, '')) != ''
                  AND TRIM(COALESCE(sub_region, '')) != ''
                  AND TRIM(hierarchy_tag_sbu) = TRIM(sub_region)
                """
            )
        )
        db.execute(
            text(
                """
                UPDATE clients c
                SET hierarchy_tag_sbu = NULL
                WHERE TRIM(COALESCE(c.hierarchy_tag_sbu, '')) != ''
                  AND EXISTS (
                    SELECT 1 FROM projects p
                    WHERE p.client_id = c.id
                      AND TRIM(COALESCE(p.sub_region, '')) != ''
                      AND TRIM(c.hierarchy_tag_sbu) = TRIM(p.sub_region)
                  )
                """
            )
        )
        db.commit()
        print(f"Cleared hierarchy_tag_sbu on {stats['projects_cleared']} projects")
        print(f"Cleared hierarchy_tag_sbu on {stats['clients_cleared']} clients")
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="Report rows only; do not update")
    args = ap.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
