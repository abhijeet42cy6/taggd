"""
Apply Region / Sub Region from a corporate finance workbook «Mapping» sheet onto Project rows.

Only ``Project.region`` and ``Project.sub_region`` are modified; all other columns are left
unchanged. Blank mapping cells do not overwrite existing DB values.
"""
from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.database import Project


def _norm_sheet_token(s: str) -> str:
    t = str(s).strip().lower().replace("_", " ")
    return " ".join(t.split())


def _pick_sheet(xl: pd.ExcelFile, *candidates: str) -> Optional[str]:
    names = list(xl.sheet_names)
    exact = set(names)
    norm_to_sheet: dict[str, str] = {}
    for n in names:
        k = _norm_sheet_token(n)
        if k not in norm_to_sheet:
            norm_to_sheet[k] = n
    for raw in candidates:
        if raw in exact:
            return raw
        k = _norm_sheet_token(raw)
        if k in norm_to_sheet:
            return norm_to_sheet[k]
    return None


def _normalize_account_key(name: str) -> str:
    return " ".join(str(name).strip().split())


def _norm_col(c) -> str:
    return _norm_sheet_token(str(c))


def _cell_project(row: pd.Series, col_map: dict[str, str]) -> Optional[str]:
    for hdr, kind in col_map.items():
        if kind != "project":
            continue
        v = row.get(hdr)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if not s or s.lower() in ("nan", "total", "grand total", "subtotal"):
            return None
        return s
    return None


def _cell_region_sub(row: pd.Series, col_map: dict[str, str]) -> tuple[Optional[str], Optional[str]]:
    reg: Optional[str] = None
    sub: Optional[str] = None
    for hdr, kind in col_map.items():
        if kind not in ("region", "sub_region"):
            continue
        v = row.get(hdr)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if not s or s.lower() in ("nan", "none", "-"):
            continue
        if kind == "region":
            reg = s
        else:
            sub = s
    return reg, sub


def _build_mapping_column_map(columns: list) -> dict[str, str]:
    """Map raw header -> semantic key (project | region | sub_region)."""
    aliases_project = {"project", "account", "client", "customer", "account name", "group name"}
    aliases_region = {"region"}
    aliases_sub = {"sub region", "sub-region", "subregion"}
    out: dict[str, str] = {}
    for c in columns:
        nk = _norm_col(c)
        if nk in aliases_project:
            out[c] = "project"
        elif nk in aliases_region:
            out[c] = "region"
        elif nk in aliases_sub:
            out[c] = "sub_region"
    return out


@dataclass
class MappingRegionApplyStats:
    sheet_name: Optional[str]
    mapping_rows_scanned: int
    distinct_accounts_in_sheet: int
    project_rows_updated: int
    accounts_in_sheet_not_in_db: int


def apply_project_regions_from_finance_mapping_workbook(db: Session, file_path: str) -> MappingRegionApplyStats:
    """
    Read «Mapping» from ``file_path`` and set ``region`` / ``sub_region`` on matching ``Project`` rows.

    Match key: ``lower(trim(Project.account_name))`` equals normalized Mapping **Project** cell,
    consistent with ``ingest_finance.get_project``.

    Only non-empty Mapping values apply; empty cells do not erase existing DB fields.
    """
    path = os.path.abspath(file_path)
    if not os.path.isfile(path):
        return MappingRegionApplyStats(None, 0, 0, 0, 0)

    xl = pd.ExcelFile(path)
    sheet = _pick_sheet(xl, "Mapping", "mapping", "Region Mapping", "Account Mapping")
    if not sheet:
        return MappingRegionApplyStats(None, 0, 0, 0, 0)

    df = xl.parse(sheet)
    col_map = _build_mapping_column_map(list(df.columns))
    if not any(v == "project" for v in col_map.values()):
        return MappingRegionApplyStats(sheet, 0, 0, 0, 0)

    # Last non-empty wins per account key (scan top-to-bottom).
    merged: dict[str, list[Optional[str]]] = {}

    scanned = 0
    for _, row in df.iterrows():
        scanned += 1
        pname = _cell_project(row, col_map)
        if not pname:
            continue
        key = _normalize_account_key(pname).lower()
        if not key:
            continue
        reg, sub = _cell_region_sub(row, col_map)
        cur = merged.setdefault(key, [None, None])
        if reg is not None:
            cur[0] = reg
        if sub is not None:
            cur[1] = sub

    if not merged:
        return MappingRegionApplyStats(sheet, scanned, 0, 0, 0)

    all_projects = db.query(Project).all()
    by_key: dict[str, list[Project]] = defaultdict(list)
    for p in all_projects:
        ak = _normalize_account_key(p.account_name or "").lower()
        if ak:
            by_key[ak].append(p)

    updated = 0
    missing = 0
    for key, pair in merged.items():
        nr, ns = pair
        if nr is None and ns is None:
            continue
        targets = by_key.get(key)
        if not targets:
            missing += 1
            continue
        for p in targets:
            changed = False
            if nr is not None and (p.region or "").strip() != nr:
                p.region = nr
                changed = True
            if ns is not None and (p.sub_region or "").strip() != ns:
                p.sub_region = ns
                changed = True
            if changed:
                updated += 1

    return MappingRegionApplyStats(
        sheet_name=sheet,
        mapping_rows_scanned=scanned,
        distinct_accounts_in_sheet=len(merged),
        project_rows_updated=updated,
        accounts_in_sheet_not_in_db=missing,
    )


def count_projects_missing_region(db: Session) -> int:
    """Rows with empty ``region`` (used for logging only)."""
    q = (
        db.query(Project)
        .filter(func.trim(func.coalesce(Project.region, "")) == "")
        .count()
    )
    return int(q or 0)
