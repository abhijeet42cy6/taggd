"""
Ingest client / project directory metadata (charge code, heads, region, category, etc.)
from Excel. Matches existing Project rows by charge_code (preferred) or Group Name / account_name.

Expected columns (headers are matched case-insensitively with common aliases):
  New Charge Code | Charge Code
  Group Name | Account Name | Client
  Status | Account Status
  Region
  Sub Region | Sub-Region
  Function Head
  Regional Head
  Account Type | Practice Type
  Practice Head
  Category
"""
from __future__ import annotations

import os
import re
import sys
from typing import Any, Dict, Optional

import pandas as pd
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from backend.db.database import SessionLocal, Project, Client, init_db, ensure_project_client


def _norm_key(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).strip().lower())


def directory_group_matches_project_account(sheet_group_name: str, project_account_name: Optional[str]) -> bool:
    """True if DB project.account_name is the sheet Group Name or an SBU under it (e.g. Siemens / Siemens - GBS)."""
    gn = _norm_key(sheet_group_name)
    pn = _norm_key(project_account_name or "")
    if not gn or not pn:
        return False
    if pn == gn:
        return True
    if pn.startswith(gn + " -") or pn.startswith(gn + " –"):
        return True
    if pn.startswith(gn + " ") and len(pn) > len(gn):
        return True
    return False


def project_account_should_keep_instead_of_group_name(sheet_group: str, project_account: str) -> bool:
    """If True, do not replace project.account_name with sheet Group Name (SBU / entity label)."""
    cur = (project_account or "").strip()
    if not cur:
        return False
    if " - " in cur or "–" in cur:
        return True
    if "(" in cur:
        return True
    gn = _norm_key(sheet_group)
    pn = _norm_key(cur)
    if not gn or pn == gn:
        return False
    if pn.startswith(gn + " -") or pn.startswith(gn + " –") or (pn.startswith(gn + " ") and len(pn) > len(gn)):
        return True
    return False


def _build_column_map(columns: list) -> Dict[str, str]:
    """Map normalized header -> canonical field name."""
    aliases = {
        "new charge code": "charge_code",
        "charge code": "charge_code",
        "group name": "account_name",
        "account name": "account_name",
        "client": "account_name",
        "status": "account_status",
        "account status": "account_status",
        "region": "region",
        "sub region": "sub_region",
        "sub-region": "sub_region",
        "subregion": "sub_region",
        "function head": "function_head",
        "regional head": "regional_head",
        "account type": "practice",
        "practice type": "practice",
        "practice": "practice",
        "practice head": "practice_head",
        "project head": "project_head",
        "projecthead": "project_head",
        "category": "category",
        "parent client": "parent_client_name",
        "legal client": "parent_client_name",
        "client group": "parent_client_name",
        "rollup client": "parent_client_name",
        "sbu": "engagement_name",
        "business unit": "engagement_name",
        "engagement": "engagement_name",
    }
    out: Dict[str, str] = {}
    for c in columns:
        nk = _norm_key(c)
        if nk in aliases:
            out[c] = aliases[nk]
    return out


def _cell(row: pd.Series, col_map: Dict[str, str], field: str) -> Optional[str]:
    for raw, canon in col_map.items():
        if canon != field:
            continue
        v = row.get(raw)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        s = str(v).strip()
        return s if s and s.lower() not in ("nan", "none", "-") else None
    return None


def _find_project(db: Session, charge_code: Optional[str], account_name: Optional[str]) -> Optional[Project]:
    from sqlalchemy import func

    cc = (charge_code or "").strip()
    if cc:
        p = db.query(Project).filter(Project.charge_code == cc).first()
        if p:
            return p
    name = (account_name or "").strip()
    if not name:
        return None
    key = " ".join(name.split()).lower()
    return (
        db.query(Project)
        .filter(func.lower(func.trim(Project.account_name)) == key)
        .first()
    )


def _find_or_create_client(db: Session, official_name: Optional[str]) -> Optional[Client]:
    from sqlalchemy import func

    n = (official_name or "").strip()
    if not n:
        return None
    c = db.query(Client).filter(func.lower(Client.official_name) == n.lower()).first()
    if c:
        return c
    c = Client(official_name=n[:500], lifecycle_state="active")
    db.add(c)
    db.flush()
    return c


def apply_directory_row_to_project(
    db: Session,
    proj: Project,
    row: pd.Series,
    col_map: Dict[str, str],
    *,
    source_basename: str | None = None,
    overwrite_charge: bool = True,
) -> None:
    """
    Apply one directory sheet row to an existing Project (used by ingest and reconcile).
    When overwrite_charge is False, an existing non-empty charge_code on the project is kept.
    """
    charge = _cell(row, col_map, "charge_code")
    acc = _cell(row, col_map, "account_name")
    if charge and overwrite_charge:
        proj.charge_code = charge
    elif charge and not (proj.charge_code or "").strip():
        proj.charge_code = charge
    if acc:
        # Group Name in directory = client label; do not replace SBU / entity account_name.
        cur = (proj.account_name or "").strip()
        acc_key = " ".join(acc.split()).lower()
        cur_key = " ".join(cur.split()).lower()
        if not cur:
            proj.account_name = acc
        elif cur_key == acc_key:
            proj.account_name = acc
        elif not project_account_should_keep_instead_of_group_name(acc, cur):
            proj.account_name = acc

    for field in (
        "account_status",
        "region",
        "sub_region",
        "function_head",
        "regional_head",
        "practice",
        "practice_head",
        "project_head",
        "category",
    ):
        val = _cell(row, col_map, field)
        if val is not None:
            setattr(proj, field, val)

    parent_client = _cell(row, col_map, "parent_client_name")
    if parent_client:
        cl = _find_or_create_client(db, parent_client)
        if cl:
            proj.client_id = cl.id
    elif acc:
        # Group Name is the canonical client for this row when no explicit parent column.
        cl = _find_or_create_client(db, acc)
        if cl:
            proj.client_id = cl.id
    sbu = _cell(row, col_map, "engagement_name")
    if sbu:
        proj.engagement_name = sbu[:500]
    if proj.client_id is None:
        ensure_project_client(db, proj)
    if source_basename:
        proj.source_filename = source_basename


def ingest_project_master_file(file_path: str, db: Session | None = None) -> Dict[str, Any]:
    """
    Read first sheet of Excel; update matching Project rows. Returns counts.
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()

    updated = 0
    skipped = 0
    missing: list[str] = []

    try:
        df = pd.read_excel(file_path, sheet_name=0)
        df.columns = [str(c).strip() for c in df.columns]
        col_map = _build_column_map(list(df.columns))
        if not col_map:
            return {"error": "No recognized columns. Expected headers like 'New Charge Code', 'Group Name', …", "updated": 0, "skipped": 0}

        for _, row in df.iterrows():
            charge = _cell(row, col_map, "charge_code")
            acc = _cell(row, col_map, "account_name")
            if not charge and not acc:
                skipped += 1
                continue

            proj = _find_project(db, charge, acc)
            if not proj:
                missing.append(charge or acc or "?")
                skipped += 1
                continue

            apply_directory_row_to_project(
                db,
                proj,
                row,
                col_map,
                source_basename=os.path.basename(file_path),
                overwrite_charge=True,
            )
            updated += 1

        db.commit()
        return {
            "updated": updated,
            "skipped": skipped,
            "not_found_sample": missing[:15],
            "not_found_count": len(missing),
            "file": os.path.basename(file_path),
        }
    except Exception:
        db.rollback()
        raise
    finally:
        if own_session:
            db.close()


def main():
    import argparse

    init_db()
    ap = argparse.ArgumentParser(description="Ingest project directory metadata from Excel")
    ap.add_argument("file", help="Path to .xlsx")
    args = ap.parse_args()
    db = SessionLocal()
    try:
        r = ingest_project_master_file(args.file, db)
        print(r)
    finally:
        db.close()


if __name__ == "__main__":
    main()
