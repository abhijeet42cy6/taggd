#!/usr/bin/env python3
"""
Align Cloud SQL (or local Postgres) portfolio to excel_files_imp/Book62.xlsx.

- Book62 rows: projects.account_status='Active', clients.lifecycle_state='active',
  sync regional_head (RH), practice_head (Project Head), region.
- All other projects: account_status='inactive', clients.lifecycle_state='prospect'.

Usage (repo root):
  # Dry-run (default)
  python3 backend/scripts/apply_book62_portfolio_alignment.py

  # Apply (requires DATABASE_URL)
  DATABASE_URL=postgresql+psycopg://... python3 backend/scripts/apply_book62_portfolio_alignment.py --apply

  # Custom workbook path
  python3 backend/scripts/apply_book62_portfolio_alignment.py --book excel_files_imp/Book62.xlsx --apply
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

_REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO))

from backend.db.database import Client, Project, init_db  # noqa: E402


def _norm_name(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _canonical_brand(name: str) -> str:
    n = str(name or "").strip()
    return re.sub(r"\s+Leadership\s*$", "", n, flags=re.I).strip()


def load_book62(path: Path) -> List[Dict[str, Any]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        raise SystemExit(f"Empty workbook: {path}")
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    out: List[Dict[str, Any]] = []
    for raw in rows[1:]:
        if not raw or raw[0] is None or str(raw[0]).strip() == "":
            continue
        rec = {header[i]: raw[i] for i in range(min(len(header), len(raw)))}
        project = str(rec.get("Project") or "").strip()
        if not project:
            continue
        out.append(
            {
                "project": project,
                "rh": str(rec.get("RH") or "").strip() or None,
                "project_head": str(rec.get("Project Head") or "").strip() or None,
                "region": str(rec.get("Region") or "").strip() or None,
                "canonical": _canonical_brand(project),
            }
        )
    return out


def resolve_project_id(by_exact: Dict[str, int], by_norm: Dict[str, List[int]], book_name: str) -> Optional[int]:
    if book_name in by_exact:
        return by_exact[book_name]
    hits = by_norm.get(_norm_name(book_name), [])
    if len(hits) == 1:
        return hits[0]
    return None


def build_indexes(session: Session) -> Tuple[Dict[str, int], Dict[str, List[int]], List[Project]]:
    projects = session.query(Project).all()
    by_exact: Dict[str, int] = {}
    by_norm: Dict[str, List[int]] = defaultdict(list)
    for p in projects:
        name = (p.account_name or "").strip()
        if name:
            by_exact[name] = p.id
            by_norm[_norm_name(name)].append(p.id)
    return by_exact, by_norm, projects


def run_alignment(
    session: Session,
    book_rows: List[Dict[str, Any]],
    apply: bool,
) -> Dict[str, Any]:
    by_exact, by_norm, all_projects = build_indexes(session)

    book_pids: Set[int] = set()
    book_client_ids: Set[int] = set()
    missing: List[str] = []
    updated_projects: List[Dict[str, Any]] = []

    for row in book_rows:
        pid = resolve_project_id(by_exact, by_norm, row["project"])
        if pid is None:
            missing.append(row["project"])
            continue
        book_pids.add(pid)
        p = session.get(Project, pid)
        if not p:
            continue
        if p.client_id:
            book_client_ids.add(p.client_id)

        changes: Dict[str, Tuple[Any, Any]] = {}
        if (p.account_status or "").strip().lower() != "active":
            changes["account_status"] = (p.account_status, "Active")
            p.account_status = "Active"
        if row["rh"] and (p.regional_head or "").strip() != row["rh"]:
            changes["regional_head"] = (p.regional_head, row["rh"])
            p.regional_head = row["rh"]
        if row["project_head"] and (p.practice_head or "").strip() != row["project_head"]:
            changes["practice_head"] = (p.practice_head, row["project_head"])
            p.practice_head = row["project_head"]
        if row["region"] and (p.region or "").strip() != row["region"]:
            changes["region"] = (p.region, row["region"])
            p.region = row["region"]

        if changes:
            updated_projects.append({"project_id": pid, "account_name": p.account_name, "changes": changes})

    inactive_projects: List[Dict[str, Any]] = []
    inactive_client_ids: Set[int] = set()
    for p in all_projects:
        if p.id in book_pids:
            continue
        changes: Dict[str, Tuple[Any, Any]] = {}
        if (p.account_status or "").strip().lower() != "inactive":
            changes["account_status"] = (p.account_status, "inactive")
            p.account_status = "inactive"
        if changes:
            inactive_projects.append({"project_id": p.id, "account_name": p.account_name, "changes": changes})
        if p.client_id:
            inactive_client_ids.add(p.client_id)

    # Book clients → active
    active_clients = 0
    for cid in book_client_ids:
        c = session.get(Client, cid)
        if not c:
            continue
        if (c.lifecycle_state or "").lower() != "active":
            c.lifecycle_state = "active"
            active_clients += 1

    # Non-book clients → prospect (only if no book project still linked — all projects demoted)
    prospect_clients = 0
    for cid in inactive_client_ids:
        if cid in book_client_ids:
            continue
        c = session.get(Client, cid)
        if not c:
            continue
        if (c.lifecycle_state or "").lower() != "prospect":
            c.lifecycle_state = "prospect"
            prospect_clients += 1

    summary = {
        "book_rows": len(book_rows),
        "book_projects_matched": len(book_pids),
        "book_missing": missing,
        "projects_marked_active": len(book_pids),
        "projects_metadata_updated": len(updated_projects),
        "projects_marked_inactive": len(inactive_projects),
        "clients_marked_active": active_clients,
        "clients_marked_prospect": prospect_clients,
        "total_projects": len(all_projects),
    }

    if apply:
        session.commit()
        print("==> COMMITTED to database")
    else:
        session.rollback()
        print("==> DRY RUN (no changes committed). Pass --apply to write.")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Align portfolio to Book62.xlsx")
    parser.add_argument(
        "--book",
        default=str(_REPO / "excel_files_imp" / "Book62.xlsx"),
        help="Path to Book62 workbook",
    )
    parser.add_argument("--apply", action="store_true", help="Commit changes (default: dry-run)")
    args = parser.parse_args()

    book_path = Path(args.book)
    if not book_path.is_file():
        raise SystemExit(f"Book not found: {book_path}")

    db_url = os.environ.get("DATABASE_URL", "").strip()
    if not db_url:
        raise SystemExit("Set DATABASE_URL (postgresql+psycopg://...)")

    book_rows = load_book62(book_path)
    print(f"==> Loaded {len(book_rows)} rows from {book_path}")

    init_db()
    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        summary = run_alignment(session, book_rows, apply=args.apply)
    finally:
        session.close()

    print("\n==> Summary")
    for k, v in summary.items():
        if k == "book_missing" and v:
            print(f"  {k}: {v}")
        elif k != "book_missing":
            print(f"  {k}: {v}")

    if summary.get("book_missing"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
