#!/usr/bin/env python3
"""
Copy data from a SQLite revenue_generator.db into PostgreSQL (DATABASE_URL).

Default source (override with SQLITE_SOURCE_PATH):
  /Users/arjun/Software/tagged_data_sql/revenue_generator.db

Prerequisites:
  - Target Postgres empty or --truncate (drops all app tables)
  - Run: alembic upgrade head   (or let this script call create_all via Alembic)

Usage (from repo root, venv active):
  export DATABASE_URL='postgresql+psycopg://tgddata:tgddata_dev@localhost:5432/tgddata'
  python -m backend.scripts.migrate_sqlite_to_postgres --truncate
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError

DEFAULT_SQLITE_SOURCE = "/Users/arjun/Software/tagged_data_sql/revenue_generator.db"

# FK-safe load order (parents before children).
TABLE_LOAD_ORDER: tuple[str, ...] = (
    "users",
    "clients",
    "projects",
    "user_project_assignments",
    "user_composio_connections",
    "client_dashboard_configs",
    "project_transitions",
    "project_contracts",
    "platform_meetings",
    "meeting_action_items",
    "resume_supplier_licenses",
    "platform_tasks",
    "task_assignees",
    "records",
    "candidates",
    "candidate_masters",
    "candidate_master_links",
    "metric_definitions",
    "sla_performances",
    "wfm_hr_benchmarks",
    "wfm_resource_gaps",
    "finance_monthly_ledger",
    "finance_cash_flow",
    "finance_efficiency_kpis",
    "revenue_weekly_submission",
    "revenue_forecast_weekly",
    "revenue_visibility_snapshot",
    "taggd_revenue_billing",
    "finance_billing_workflow",
    "finance_billing_validation_events",
    "finance_payment_receipts",
    "finance_tds_certificates",
    "finance_bank_statement_lines",
    "ingestion_events",
    "activity_log",
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _require_postgres(url: str) -> None:
    from backend.db.engine import is_postgres_url

    if not is_postgres_url(url):
        print("DATABASE_URL must be a PostgreSQL URL.", file=sys.stderr)
        sys.exit(1)


def _tables_in_db(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def truncate_target(engine: Engine, tables: list[str]) -> None:
    quoted = ", ".join(f'"{t}"' for t in tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))


def copy_table(
    src_path: Path,
    dst_conn,
    table_name: str,
    *,
    batch_size: int = 500,
) -> int:
    """Read rows via sqlite3 (avoids broken legacy FKs like projects_old in source DB)."""
    dst_meta = MetaData()
    dst_table = Table(table_name, dst_meta, autoload_with=dst_conn)
    dst_cols = {c.name for c in dst_table.columns}

    sconn = sqlite3.connect(src_path)
    sconn.row_factory = sqlite3.Row
    try:
        cur = sconn.execute(f'SELECT * FROM "{table_name}"')
        raw_rows = cur.fetchall()
        if not raw_rows:
            return 0
        colnames = [d[0] for d in cur.description]
        payload = [
            {k: row[k] for k in colnames if k in dst_cols}
            for row in raw_rows
        ]
    finally:
        sconn.close()

    for i in range(0, len(payload), batch_size):
        dst_conn.execute(dst_table.insert(), payload[i : i + batch_size])
    return len(payload)


def reset_sequences(engine: Engine, tables: list[str]) -> None:
    with engine.begin() as conn:
        for table in tables:
            seq = conn.execute(
                text("SELECT pg_get_serial_sequence(:tbl, 'id')"),
                {"tbl": table},
            ).scalar()
            if not seq:
                continue
            conn.execute(
                text(
                    f'SELECT setval(:seq, COALESCE((SELECT MAX(id) FROM "{table}"), 1), true)'
                ),
                {"seq": seq},
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLite → PostgreSQL data migration")
    parser.add_argument(
        "--source",
        default=os.getenv("SQLITE_SOURCE_PATH", DEFAULT_SQLITE_SOURCE),
        help="Path to source SQLite file",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="TRUNCATE all target tables before copy (destructive)",
    )
    parser.add_argument(
        "--skip-alembic",
        action="store_true",
        help="Do not run alembic upgrade head before copy",
    )
    args = parser.parse_args()

    src_path = Path(args.source).expanduser().resolve()
    if not src_path.is_file():
        print(f"Source SQLite not found: {src_path}", file=sys.stderr)
        sys.exit(1)

    target_url = os.environ.get("DATABASE_URL", "").strip()
    if not target_url:
        print("Set DATABASE_URL to the target PostgreSQL connection string.", file=sys.stderr)
        sys.exit(1)
    _require_postgres(target_url)

    if str(_repo_root()) not in sys.path:
        sys.path.insert(0, str(_repo_root()))

    if not args.skip_alembic:
        from alembic import command
        from alembic.config import Config

        alembic_cfg = Config(str(_repo_root() / "alembic.ini"))
        command.upgrade(alembic_cfg, "head")

    dst_engine = create_engine(target_url, pool_pre_ping=True)

    src_tables = set(
        r[0]
        for r in sqlite3.connect(src_path).execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    )
    dst_tables = _tables_in_db(dst_engine)

    ordered = [t for t in TABLE_LOAD_ORDER if t in src_tables]
    extras = sorted(src_tables - set(ordered) - {"alembic_version"})
    ordered.extend(extras)

    missing_dst = [t for t in ordered if t not in dst_tables]
    if missing_dst:
        print(f"Target missing tables (run alembic upgrade head): {missing_dst}", file=sys.stderr)
        sys.exit(1)

    if args.truncate:
        to_trunc = [t for t in ordered if t in dst_tables]
        print(f"Truncating {len(to_trunc)} tables on target...")
        truncate_target(dst_engine, to_trunc)

    def _try_replication_role_replica(conn) -> bool:
        """Cloud SQL app users often cannot set session_replication_role; load order must suffice."""
        try:
            conn.execute(text("SET session_replication_role = replica"))
            conn.commit()
            return True
        except Exception as e:
            print(
                f"Note: session_replication_role unavailable ({e!s}); using FK-safe table order only.",
                file=sys.stderr,
            )
            conn.rollback()
            return False

    total = 0
    batch_size = int(os.getenv("SQLITE_MIGRATE_BATCH_SIZE", "100"))
    max_retries = int(os.getenv("SQLITE_MIGRATE_MAX_RETRIES", "5"))
    replication_role_set = False
    for name in ordered:
        if name not in src_tables:
            continue
        n = 0
        for attempt in range(1, max_retries + 1):
            try:
                with dst_engine.connect() as dconn:
                    if not replication_role_set:
                        replication_role_set = _try_replication_role_replica(dconn)
                    n = copy_table(src_path, dconn, name, batch_size=batch_size)
                    dconn.commit()
                break
            except OperationalError as e:
                if attempt >= max_retries:
                    raise
                wait_s = min(30, 3 * attempt)
                print(
                    f"  {name}: connection error (attempt {attempt}/{max_retries}), retry in {wait_s}s: {e}",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(wait_s)
                dst_engine.dispose()
        total += n
        print(f"  {name}: {n} rows", flush=True)

    serial_tables = [t for t in ordered if t in dst_tables]
    try:
        reset_sequences(dst_engine, serial_tables)
    except Exception as e:
        print(f"Warning: sequence reset skipped: {e}")

    print(f"Done. Copied {total} rows from {src_path}")


if __name__ == "__main__":
    main()
