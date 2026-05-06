#!/usr/bin/env python3
"""
Backfill `projects.region` from an SLA master "Base File" sheet (column Region).

Use when SLA metrics exist but `projects.region` is NULL — e.g. projects were created via
finance/WFM first and the SLA Base File was not re-ingested. Full `ingest_sla` also stamps
region; this script only updates geography fields (faster, fewer writes).

  .venv/bin/python backend/scripts/backfill_sla_regions_from_basefile.py excel_files_imp/Raw\\ Data\\ SLA\\ Basefile.xlsx
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd

from backend.core.sla_project_resolve import resolve_project_for_sla
from backend.db.database import SessionLocal, init_db


def _xstr(row: pd.Series, key: str) -> str:
    v = row.get(key)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return ""
    return s


def backfill(path: str) -> dict:
    init_db()
    db = SessionLocal()
    stats: Counter[str] = Counter()
    updated = 0
    try:
        df = pd.read_excel(path, sheet_name="Base File", header=0)
        df.columns = [str(c).strip() for c in df.columns]
        if "Region" not in df.columns:
            raise ValueError("Base File must include a 'Region' column")

        for _, row in df.iterrows():
            account_name = _xstr(row, "Project")
            perf_measure = _xstr(row, "Performance Measure")
            if not account_name or account_name.lower() in ("sr.", "project", "metrics"):
                continue
            low = perf_measure.lower()
            if "measure" in low or "metric" in low:
                continue

            reg = _xstr(row, "Region")
            if not reg:
                stats["skipped_no_region"] += 1
                continue

            project, reason = resolve_project_for_sla(db, account_name)
            if not project:
                stats["unresolved"] += 1
                continue
            stats[f"matched_{reason}"] += 1
            if (project.region or "").strip() != reg:
                project.region = reg
                updated += 1

        db.commit()
        return {"ok": True, "projects_region_updated": updated, "stats": dict(stats)}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill projects.region from SLA Base File")
    ap.add_argument("xlsx", help="Path to SLA master .xlsx (Base File sheet)")
    args = ap.parse_args()
    r = backfill(args.xlsx)
    print(r)


if __name__ == "__main__":
    main()
