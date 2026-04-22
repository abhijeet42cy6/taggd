#!/usr/bin/env python3
"""
Link DB projects to Account Detail Mapping rows when Group Name = client and
project.account_name is an SBU line (e.g. "Siemens - GBS" under sheet "Siemens").

- Charge code match: full row apply (same as ingest).
- Otherwise: pick the sheet row with the longest matching Group Name, then apply
  metadata + client_id from Group Name without clobbering SBU account_name;
  does not overwrite an existing project charge_code when the match was not by charge.

Run after editing the workbook, or when ingest skipped SBU rows.

Examples:
  python backend/scripts/reconcile_mapping_clients.py
  python backend/scripts/reconcile_mapping_clients.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.database import Project, SessionLocal, init_db
from backend.scripts.ingest_project_master import (
    _build_column_map,
    _cell,
    _norm_key,
    apply_directory_row_to_project,
    directory_group_matches_project_account,
)


def _find_row_for_project(
    proj: Project,
    df: pd.DataFrame,
    col_map: dict[str, str],
    by_charge: dict[str, pd.Series],
) -> tuple[Optional[pd.Series], str]:
    cc = (proj.charge_code or "").strip()
    if cc and cc in by_charge:
        return by_charge[cc], "charge"

    pn = _norm_key(proj.account_name or "")
    if not pn:
        return None, ""

    best_len = -1
    matched: list[pd.Series] = []
    for _, row in df.iterrows():
        gn_raw = _cell(row, col_map, "account_name")
        if not gn_raw:
            continue
        gn = _norm_key(gn_raw)
        if not directory_group_matches_project_account(gn_raw, proj.account_name):
            continue
        ln = len(gn)
        if ln > best_len:
            best_len = ln
            matched = [row]
        elif ln == best_len:
            matched.append(row)

    if not matched:
        return None, ""

    if len(matched) == 1:
        return matched[0], "sbu_prefix"

    if cc:
        for row in matched:
            rc = _cell(row, col_map, "charge_code")
            if rc and rc.strip() == cc:
                return row, "sbu_prefix+charge"

    return matched[0], "sbu_prefix_ambiguous"


def reconcile_file(
    file_path: str,
    db: Session,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    df = pd.read_excel(file_path, sheet_name=0)
    df.columns = [str(c).strip() for c in df.columns]
    col_map = _build_column_map(list(df.columns))
    if not col_map:
        return {"error": "No recognized columns on sheet 0", "updated": 0, "skipped": 0}

    by_charge: dict[str, pd.Series] = {}
    for _, row in df.iterrows():
        ch = _cell(row, col_map, "charge_code")
        if ch:
            by_charge[ch.strip()] = row

    matched = 0
    no_match = 0
    details: list[dict[str, Any]] = []

    projects = db.query(Project).order_by(Project.id).all()
    base = os.path.basename(file_path)

    for proj in projects:
        row, kind = _find_row_for_project(proj, df, col_map, by_charge)
        if row is None:
            no_match += 1
            continue
        overwrite_charge = kind == "charge"
        if dry_run:
            matched += 1
            details.append(
                {
                    "project_id": proj.id,
                    "match": kind,
                    "charge_code": proj.charge_code,
                    "account_name": proj.account_name,
                    "sheet_charge": _cell(row, col_map, "charge_code"),
                    "sheet_group": _cell(row, col_map, "account_name"),
                }
            )
            continue

        apply_directory_row_to_project(
            db,
            proj,
            row,
            col_map,
            source_basename=base,
            overwrite_charge=overwrite_charge,
        )
        matched += 1
        details.append(
            {
                "project_id": proj.id,
                "match": kind,
                "account_name_after": proj.account_name,
                "client_id": proj.client_id,
            }
        )

    if not dry_run:
        db.commit()

    return {
        "matched": matched,
        "no_match": no_match,
        "projects_scanned": len(projects),
        "dry_run": dry_run,
        "file": base,
        "sample": details[:25],
        "sample_len": len(details),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Reconcile projects to mapping sheet by charge or SBU group prefix")
    ap.add_argument(
        "file",
        nargs="?",
        default=os.path.join(
            os.path.dirname(__file__),
            "../../excel_files_imp/Account Detail Mapping.xlsx",
        ),
        help="Path to Account Detail Mapping.xlsx",
    )
    ap.add_argument("--dry-run", action="store_true", help="List matches only; do not commit")
    args = ap.parse_args()
    path = os.path.abspath(args.file)
    if not os.path.isfile(path):
        raise SystemExit(f"File not found: {path}")

    init_db()
    db = SessionLocal()
    try:
        r = reconcile_file(path, db, dry_run=args.dry_run)
        print(r)
    finally:
        db.close()


if __name__ == "__main__":
    main()
