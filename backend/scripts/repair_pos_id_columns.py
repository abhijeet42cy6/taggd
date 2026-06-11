#!/usr/bin/env python3
"""
Repair misconfigured pos_id_column and poisoned record identity fields.

Fixes projects that picked ``Requirment Type`` instead of ``Req ID``, and records
with candidate_name ``REQ://nan`` / excel_provided_id ``nan``.

Usage (from repo root):
  python3 backend/scripts/repair_pos_id_columns.py --dry-run
  python3 backend/scripts/repair_pos_id_columns.py --commit
  python3 backend/scripts/repair_pos_id_columns.py --commit --project-id 98
"""
from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from backend.core.column_mapping_normalize import split_column_mapping  # noqa: E402
from backend.core.pos_id_column import normalize_pos_id_value, resolve_pos_id_column  # noqa: E402
from backend.db.database import Project, Record, SessionLocal, init_db  # noqa: E402

_BAD_POS_ID_NORMALIZED = frozenset(
    {
        "requirment type",
        "requirement type",
        "req type",
        "new/replcement",
        "new/replacement",
    }
)


def _headers_from_mapping(column_mapping: dict | None) -> list[str]:
    if not isinstance(column_mapping, dict):
        return []
    uni, rec = split_column_mapping(column_mapping)
    headers = [h for h in {*uni.values(), *rec.values()} if h]
    return headers


def _resolve_for_project(project: Project) -> str | None:
    headers = _headers_from_mapping(project.column_mapping)
    resolved = resolve_pos_id_column(headers)
    if resolved:
        return resolved
    # Ambuja / similar trackers always map client_req_id → Req ID in record_fields.
    if isinstance(project.column_mapping, dict):
        rec = project.column_mapping.get("record_fields") or {}
        if rec.get("client_req_id") == "Req ID":
            return "Req ID"
    return None


def _format_req_id(val) -> str:
    s = normalize_pos_id_value(val)
    if s:
        return s
    raw = str(val or "").strip()
    if raw.lower() in ("nan", "none", ""):
        return ""
    if raw.endswith(".0") and raw[:-2].isdigit():
        return raw[:-2]
    return raw


def repair_projects(db, project_ids: list[int] | None, dry_run: bool) -> int:
    q = db.query(Project)
    if project_ids:
        q = q.filter(Project.id.in_(project_ids))
    changed = 0
    for project in q.all():
        current = (project.pos_id_column or "").strip()
        current_norm = " ".join(current.lower().split())
        if current_norm not in _BAD_POS_ID_NORMALIZED and current:
            continue
        resolved = _resolve_for_project(project)
        if not resolved or resolved == current:
            continue
        print(f"  project {project.id} ({project.account_name}): pos_id_column {current!r} → {resolved!r}")
        if not dry_run:
            project.pos_id_column = resolved
        changed += 1
    return changed


def repair_records(db, project_ids: list[int] | None, dry_run: bool) -> int:
    q = db.query(Record)
    if project_ids:
        q = q.filter(Record.project_id.in_(project_ids))
    changed = 0
    for record in q.all():
        updates: list[str] = []

        excel_id = _format_req_id(record.excel_provided_id)
        client_id = _format_req_id(record.client_req_id)
        best_id = excel_id or client_id

        if str(record.excel_provided_id or "").strip().lower() in ("nan", "none", "") and best_id:
            updates.append(f"excel_provided_id→{best_id!r}")
            if not dry_run:
                record.excel_provided_id = best_id

        name = (record.candidate_name or "").strip()
        if name.upper().startswith("REQ://"):
            suffix = name[6:].strip()
            if suffix.lower() in ("nan", "none", ""):
                new_name = f"REQ://{best_id}" if best_id else "Unknown"
                updates.append(f"candidate_name→{new_name!r}")
                if not dry_run:
                    record.candidate_name = new_name
            elif suffix.endswith(".0") and suffix[:-2].isdigit():
                new_name = f"REQ://{suffix[:-2]}"
                updates.append(f"candidate_name→{new_name!r}")
                if not dry_run:
                    record.candidate_name = new_name

        if updates:
            print(f"  record {record.id} (project {record.project_id}): {', '.join(updates)}")
            changed += 1
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description="Repair pos_id_column and REQ://nan record fields.")
    ap.add_argument("--commit", action="store_true", help="Persist changes (default: dry-run).")
    ap.add_argument("--project-id", type=int, action="append", dest="project_ids", help="Limit to project id(s).")
    args = ap.parse_args()
    dry_run = not args.commit

    init_db()
    db = SessionLocal()
    try:
        print("Repair pos_id_column + record identity")
        print(f"Mode: {'DRY-RUN' if dry_run else 'COMMIT'}")
        pc = repair_projects(db, args.project_ids, dry_run)
        rc = repair_records(db, args.project_ids, dry_run)
        if not dry_run:
            db.commit()
        print(f"Done: {pc} project(s), {rc} record(s) updated.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
