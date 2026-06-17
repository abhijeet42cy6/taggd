#!/usr/bin/env python3
"""
Apply per-client tracker_config payloads from client_tracker_config_payloads.json.

Matches projects by account_name or engagement_name (case-insensitive substring).

Usage (from revagent/):
  PYTHONPATH=. python3 backend/scripts/seed_client_tracker_configs.py
  PYTHONPATH=. python3 backend/scripts/seed_client_tracker_configs.py --dry-run
  PYTHONPATH=. python3 backend/scripts/seed_client_tracker_configs.py --client Hyundai
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.core.tracker_config import merge_tracker_config
from backend.db.database import Project, SessionLocal

PAYLOADS_PATH = ROOT / "excel_upload_masters" / "client_tracker_config_payloads.json"


def _match_project(project: Project, client_key: str) -> bool:
    key = client_key.lower()
    for field in (project.account_name, project.engagement_name, project.filename):
        if field and key in str(field).lower():
            return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed tracker_config for known clients")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing")
    parser.add_argument("--client", help="Apply only this client key from JSON")
    args = parser.parse_args()

    payloads = json.loads(PAYLOADS_PATH.read_text(encoding="utf-8"))
    if args.client:
        if args.client not in payloads:
            raise SystemExit(f"Unknown client key: {args.client!r}. Keys: {list(payloads)}")
        payloads = {args.client: payloads[args.client]}

    db = SessionLocal()
    try:
        projects = db.query(Project).all()
        applied = 0
        for client_key, patch in payloads.items():
            matches = [p for p in projects if _match_project(p, client_key)]
            if not matches:
                print(f"WARN: no project matched {client_key!r}")
                continue
            for proj in matches:
                merged = merge_tracker_config(
                    proj.tracker_config if isinstance(proj.tracker_config, dict) else {},
                    patch,
                )
                label = proj.account_name or proj.engagement_name or proj.filename
                print(f"{'[dry-run] ' if args.dry_run else ''}PRJ-{proj.id} {label!r} ← {client_key}")
                if not args.dry_run:
                    proj.tracker_config = merged
                    applied += 1
        if not args.dry_run:
            db.commit()
            print(f"Updated {applied} project(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
