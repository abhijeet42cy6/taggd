#!/usr/bin/env python3
"""
Load `01_spine_clients_projects` master workbooks (ORM field names in row 1, hint row 2, data from row 3)
into `clients` and `projects`, merging with existing DB rows.

Merge keys (in order):
  - clients: optional `id` (if row id exists in DB) → else `short_code` (if unique match) → else
    `official_name` (case-insensitive)
  - projects: optional `id` → else `charge_code` → else normalized `account_name`

Each row i in `clients` is paired with row i in `projects` (same index). After resolve/upsert,
`projects.client_id` is set to the resolved client for that pair so the spine defines the link.

Run from repo root:
  python3 backend/scripts/ingest_spine_clients_projects.py excel_files_imp/01_spine_clients_projects_filled.xlsx
  python3 backend/scripts/ingest_spine_clients_projects.py --dry-run path/to/workbook.xlsx

See docs/DATA_INGESTION_RUNBOOK.md (spine / directory section).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Any

import pandas as pd
from sqlalchemy import func

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.database import (  # noqa: E402
    Client,
    Project,
    SessionLocal,
    User,
    init_db,
)

UPLOADED_BY = "ingest_spine_clients_projects"

# ORM columns that are safe to set from the sheet (exclude relationships)
_CLIENT_COLS = {c.key for c in Client.__table__.columns if c.key not in ("id",)}
_PROJECT_COLS = {c.key for c in Project.__table__.columns if c.key not in ("id",)}


def _read_table_sheet(path: str, sheet: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet, header=0, skiprows=[1])


def _parse_optional_id(val: Any) -> int | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        i = int(float(val))
        return i if i > 0 else None
    except (TypeError, ValueError):
        return None


def _str_cell(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "-", "—"):
        return None
    return s


def _norm_name(s: str) -> str:
    return " ".join(s.strip().split()).lower()


def _coerce_dt(val: Any) -> datetime | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val
    t = pd.to_datetime(val, errors="coerce")
    if pd.isna(t):
        return None
    p = t.to_pydatetime()
    if p.tzinfo is not None:
        return p.replace(tzinfo=None)
    return p


def _row_to_kwargs(
    row: pd.Series,
    allowed: set[str],
    *,
    model: str,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in allowed:
        if k not in row.index:
            continue
        v = row.get(k)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        if k in (
            "system_created_at",
            "system_updated_at",
            "metrics_updated_at",
            "created_at",
            "updated_at",
        ):
            d = _coerce_dt(v)
            if d:
                out[k] = d
            continue
        if k in ("project_head_user_id", "parent_project_id", "client_id"):
            oid = _parse_optional_id(v)
            if oid is not None:
                out[k] = oid
            continue
        if k == "column_mapping" or k == "revenue_logic_code" or k == "logic_explanation":
            if isinstance(v, str) and v.strip().startswith("{"):
                try:
                    out[k] = json.loads(v)
                except json.JSONDecodeError:
                    out[k] = v
            elif k == "column_mapping" and isinstance(v, dict):
                out[k] = v
            else:
                s = _str_cell(v)
                if s is not None:
                    out[k] = s
            continue
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            if k in ("filename", "tracker_sheet", "contract_sheet", "account_name", "charge_code"):
                out[k] = _str_cell(v) or str(int(v)) if float(v) == int(v) else str(v)
            else:
                out[k] = v
            continue
        s = _str_cell(v)
        if s is not None:
            out[k] = s[:2000] if len(s) > 2000 else s
    # defaults
    if model == "client" and "lifecycle_state" not in out and "lifecycle_state" in allowed:
        pass
    return out


def _find_client(
    db,
    *,
    row_id: int | None,
    official_name: str | None,
    short_code: str | None,
) -> Client | None:
    if row_id is not None:
        c = db.query(Client).filter(Client.id == row_id).first()
        if c:
            return c
    sc = (short_code or "").strip()
    if sc:
        q = db.query(Client).filter(Client.short_code == sc).all()
        if len(q) == 1:
            return q[0]
    on = (official_name or "").strip()
    if on:
        return db.query(Client).filter(func.lower(Client.official_name) == on.lower()).first()
    return None


def _find_project(
    db,
    *,
    row_id: int | None,
    charge_code: str | None,
    account_name: str | None,
) -> Project | None:
    if row_id is not None:
        p = db.query(Project).filter(Project.id == row_id).first()
        if p:
            return p
    cc = (charge_code or "").strip()
    if cc:
        p = db.query(Project).filter(Project.charge_code == cc).first()
        if p:
            return p
    an = (account_name or "").strip()
    if an:
        key = _norm_name(an)
        return (
            db.query(Project)
            .filter(func.lower(func.trim(Project.account_name)) == key)
            .first()
        )
    return None


def _valid_user_id(db, uid: int | None) -> int | None:
    if uid is None:
        return None
    u = db.query(User).filter(User.id == uid).first()
    return uid if u else None


def _valid_parent_project_id(db, pid: int | None, self_id: int | None) -> int | None:
    if pid is None:
        return None
    if self_id is not None and pid == self_id:
        return None
    p = db.query(Project).filter(Project.id == pid).first()
    return pid if p else None


def ingest_spine_clients_projects(
    file_path: str,
    db,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    base = os.path.basename(file_path)
    dfc = _read_table_sheet(file_path, "clients")
    dfp = _read_table_sheet(file_path, "projects")
    n = min(len(dfc), len(dfp))
    if len(dfc) != len(dfp):
        # still process aligned prefix; report tail
        pass

    stats: dict[str, Any] = {
        "file": base,
        "pairs_processed": 0,
        "clients_created": 0,
        "clients_updated": 0,
        "projects_created": 0,
        "projects_updated": 0,
        "pairs_skipped": 0,
        "warnings": [],
    }
    if len(dfc) != len(dfp):
        stats["warnings"].append(
            f"Row count mismatch: clients={len(dfc)} projects={len(dfp)}; using first {n} aligned rows."
        )

    now = datetime.utcnow()

    for i in range(n):
        c_row = dfc.iloc[i]
        p_row = dfp.iloc[i]

        cname = _str_cell(c_row.get("official_name"))
        if not cname:
            stats["pairs_skipped"] += 1
            stats["warnings"].append(f"row index {i}: client official_name empty; skipped pair.")
            continue

        c_id_hint = _parse_optional_id(c_row.get("id"))
        scode = _str_cell(c_row.get("short_code"))
        client = _find_client(
            db,
            row_id=c_id_hint,
            official_name=cname,
            short_code=scode,
        )

        c_kw = _row_to_kwargs(c_row, _CLIENT_COLS, model="client")
        c_kw.pop("id", None)
        c_kw["official_name"] = cname[:500]
        if scode:
            c_kw["short_code"] = scode[:200]
        if "lifecycle_state" not in c_kw or not c_kw.get("lifecycle_state"):
            c_kw["lifecycle_state"] = "active"
        c_kw["source_filename"] = base
        c_kw["uploaded_by"] = UPLOADED_BY
        c_kw["system_updated_at"] = now
        if "system_created_at" not in c_kw:
            c_kw["system_created_at"] = now

        if client is None:
            if dry_run:
                stats["clients_created"] += 1
            else:
                client = Client()
                for k, v in c_kw.items():
                    if hasattr(client, k):
                        setattr(client, k, v)
                db.add(client)
                db.flush()
                stats["clients_created"] += 1
        else:
            if not dry_run:
                for k, v in c_kw.items():
                    if k == "system_created_at" and getattr(client, "system_created_at", None):
                        continue
                    if hasattr(client, k):
                        setattr(client, k, v)
            stats["clients_updated"] += 1

        # Resolved client id for pairing (None in dry_run when this row would create a new client)
        client_id: int | None
        if client is not None:
            client_id = client.id
        else:
            client_id = None

        pname = _str_cell(p_row.get("account_name"))
        pcharge = _str_cell(p_row.get("charge_code"))
        if not pname and not pcharge:
            stats["pairs_skipped"] += 1
            stats["warnings"].append(f"row index {i}: project account_name and charge_code both empty; skipped.")
            continue

        p_id_hint = _parse_optional_id(p_row.get("id"))
        if pname is None:
            pname = f"Project {pcharge or p_id_hint or i}"

        proj = _find_project(
            db,
            row_id=p_id_hint,
            charge_code=pcharge,
            account_name=pname,
        )

        p_kw = _row_to_kwargs(p_row, _PROJECT_COLS, model="project")
        p_kw.pop("id", None)
        p_kw.pop("client_id", None)
        p_kw["account_name"] = pname[:2000] if len(pname) > 2000 else pname
        if pcharge:
            p_kw["charge_code"] = pcharge[:500]
        p_kw["source_filename"] = base
        p_kw["uploaded_by"] = UPLOADED_BY
        p_kw["system_updated_at"] = now
        if "system_created_at" not in p_kw:
            p_kw["system_created_at"] = now

        if "project_head_user_id" in p_kw:
            p_kw["project_head_user_id"] = _valid_user_id(db, p_kw.get("project_head_user_id"))

        raw_parent = p_kw.get("parent_project_id")
        if not dry_run:
            p_parent = _parse_optional_id(raw_parent) if raw_parent is not None else None
            p_kw["parent_project_id"] = _valid_parent_project_id(
                db, p_parent, proj.id if proj is not None else None
            )
        else:
            p_kw.pop("parent_project_id", None)

        if proj is None:
            if dry_run:
                stats["projects_created"] += 1
            else:
                if client_id is None:
                    stats["warnings"].append(
                        f"row index {i}: internal error — no client_id after client upsert; skipped project."
                    )
                    stats["pairs_skipped"] += 1
                    continue
                proj = Project()
                p_kw["client_id"] = client_id
                for k, v in p_kw.items():
                    if not hasattr(proj, k):
                        continue
                    if v is None and k not in ("column_mapping", "revenue_logic_code", "logic_explanation"):
                        continue
                    setattr(proj, k, v)
                if not getattr(proj, "filename", None):
                    proj.filename = base
                db.add(proj)
                db.flush()
                stats["projects_created"] += 1
        else:
            if not dry_run:
                p_kw["client_id"] = client_id
                for k, v in p_kw.items():
                    if not hasattr(proj, k):
                        continue
                    if v is None and k not in ("column_mapping", "revenue_logic_code", "logic_explanation"):
                        continue
                    setattr(proj, k, v)
                if not (proj.filename or "").strip():
                    proj.filename = base
            stats["projects_updated"] += 1

        stats["pairs_processed"] += 1

    if not dry_run:
        db.commit()
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Ingest 01_spine_clients_projects-style workbook into clients + projects (merge).",
    )
    ap.add_argument("file", help="Path to .xlsx (sheets: clients, projects).")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve matches and count actions without committing.",
    )
    args = ap.parse_args()

    init_db()
    path = args.file
    if not os.path.isfile(path):
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        r = ingest_spine_clients_projects(path, db, dry_run=args.dry_run)
        print(r)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
