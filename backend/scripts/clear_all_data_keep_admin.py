#!/usr/bin/env python3
"""
Wipe all application data while keeping at least one platform admin login.

Keeps any user with role in: platform_admin, admin (legacy).
Clears all rows from other tables, then removes all other users.

Usage (from repo root, with venv and DATABASE_URL if not default):
  python backend/scripts/clear_all_data_keep_admin.py --yes

SQLite default: sqlite:///./revenue_generator.db (path relative to cwd when backend runs).
Set DATABASE_URL for Postgres, etc.

For manual SQLite, see backend/scripts/clear_data_keep_admin.sql
"""
from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# Table names in dependency-safe order (children before parents when FKs on).
# With SQLite PRAGMA foreign_keys=OFF, order does not matter; kept explicit for clarity.
_DATA_TABLES = [
    "activity_log",
    "candidate_master_links",
    "candidates",
    "candidate_masters",
    "finance_bank_statement_lines",
    "finance_billing_validation_events",
    "finance_payment_receipts",
    "finance_tds_certificates",
    "finance_billing_workflow",
    "taggd_revenue_billing",
    "revenue_forecast_weekly",
    "revenue_visibility_snapshot",
    "revenue_weekly_submission",
    "finance_efficiency_kpis",
    "finance_cash_flow",
    "finance_monthly_ledger",
    "wfm_resource_gaps",
    "wfm_hr_benchmarks",
    "sla_performances",
    "metric_definitions",
    "meeting_action_items",
    "platform_meetings",
    "task_assignees",
    "platform_tasks",
    "resume_supplier_licenses",
    "ingestion_events",
    "project_transitions",
    "project_contracts",
    "records",
    "user_project_assignments",
    "projects",
    "clients",
]


def _is_sqlite(engine: Engine) -> bool:
    return "sqlite" in (engine.dialect.name or "")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--yes",
        action="store_true",
        help="Required to actually run the destructive clear.",
    )
    args = ap.parse_args()
    if not args.yes:
        print("Refusing to run without --yes (this deletes almost all data).", file=sys.stderr)
        return 1

    url = os.environ.get("DATABASE_URL", "sqlite:///./revenue_generator.db")
    engine = create_engine(url)
    is_sql = _is_sqlite(engine)

    with engine.connect() as raw:
        rows = raw.execute(
            text("SELECT id, email, role FROM users WHERE LOWER(TRIM(role)) IN ('platform_admin', 'admin')")
        ).fetchall()
    if not rows:
        print(
            "ERROR: No user with role 'platform_admin' or 'admin' found. Create one first; aborting.",
            file=sys.stderr,
        )
        return 2

    print("Keeping user(s):")
    for r in rows:
        print(f"  id={r[0]} email={r[1]!r} role={r[2]!r}")

    with engine.connect() as conn:
        with conn.begin():
            if is_sql:
                conn.execute(text("PRAGMA foreign_keys = OFF"))

            for t in _DATA_TABLES:
                try:
                    conn.execute(text(f'DELETE FROM "{t}"'))
                except Exception as e:
                    print(f"Warning: could not clear {t}: {e}", file=sys.stderr)

            if is_sql:
                # Remove non–platform-admin users
                result = conn.execute(
                    text(
                        """
                        DELETE FROM users
                        WHERE LOWER(TRIM(role)) NOT IN ('platform_admin', 'admin')
                        """
                    )
                )
                # rowcount may be -1 in some drivers; ignore
                _ = result.rowcount
                conn.execute(text("UPDATE users SET manager_user_id = NULL"))
            else:
                # Postgres / other: same logic
                conn.execute(
                    text(
                        """
                        DELETE FROM users
                        WHERE LOWER(TRIM(role)) NOT IN ('platform_admin', 'admin')
                        """
                    )
                )
                conn.execute(text("UPDATE users SET manager_user_id = NULL"))

            if is_sql:
                conn.execute(text("PRAGMA foreign_keys = ON"))
                for t in _DATA_TABLES + ["users"]:
                    try:
                        conn.execute(text("DELETE FROM sqlite_sequence WHERE name = :n"), {"n": t})
                    except Exception:
                        pass

    print("Done. Data cleared; platform admin user(s) preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
