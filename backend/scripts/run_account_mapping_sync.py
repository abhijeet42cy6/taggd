#!/usr/bin/env python3
"""
Ingest Account Detail Mapping.xlsx (Sheet1 = project directory) and report
DB rows not on that authoritative roster.

- Calls ingest_project_master_file (updates existing projects; does not create new projects).
- Roster = every non-empty New Charge Code + normalized Group Name on sheet 0.
- "In roster" project: DB charge_code in roster OR normalized account_name equals a sheet Group Name
  OR account_name is an SBU under a sheet group (e.g. "Siemens - GBS" under group "Siemens"), longest group wins.
- Reports: extra projects, clients only tied to extra projects (or no projects).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pandas as pd

from backend.db.database import Client, Project, SessionLocal, init_db
from backend.scripts.ingest_project_master import directory_group_matches_project_account, ingest_project_master_file


def norm_account_key(name: str | None) -> str:
    return " ".join(str(name or "").strip().split()).lower()


def load_roster(xlsx_path: str) -> tuple[set[str], set[str], list[str], int]:
    df = pd.read_excel(xlsx_path, sheet_name=0)
    df.columns = [str(c).strip() for c in df.columns]
    if "New Charge Code" not in df.columns or "Group Name" not in df.columns:
        raise SystemExit("Sheet0 must include columns 'New Charge Code' and 'Group Name'")
    charges: set[str] = set()
    names: set[str] = set()
    for _, row in df.iterrows():
        raw_cc = row.get("New Charge Code")
        raw_gn = row.get("Group Name")
        cc = str(raw_cc).strip() if pd.notna(raw_cc) else ""
        gn = str(raw_gn).strip() if pd.notna(raw_gn) else ""
        if cc and cc.lower() != "nan":
            charges.add(cc)
        if gn and gn.lower() != "nan":
            names.add(norm_account_key(gn))
    sorted_names = sorted(names, key=len, reverse=True)
    return charges, names, sorted_names, len(df)


def project_in_roster(p: Project, charges: set[str], names: set[str], sorted_group_names: list[str]) -> bool:
    cc = (p.charge_code or "").strip()
    if cc and cc in charges:
        return True
    key = norm_account_key(p.account_name)
    if key and key in names:
        return True
    for g in sorted_group_names:
        if directory_group_matches_project_account(g, p.account_name):
            return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest account mapping xlsx + report DB rows off roster")
    ap.add_argument(
        "xlsx",
        nargs="?",
        default=os.path.join(
            os.path.dirname(__file__),
            "../../excel_files_imp/Account Detail Mapping.xlsx",
        ),
        help="Path to Account Detail Mapping.xlsx",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report roster vs DB; do not run ingest_project_master_file",
    )
    ap.add_argument(
        "--report",
        default="",
        help="Write markdown report to this path (default: excel_files_imp/account_mapping_sync_report.md)",
    )
    args = ap.parse_args()
    xlsx = os.path.abspath(args.xlsx)
    if not os.path.isfile(xlsx):
        raise SystemExit(f"File not found: {xlsx}")

    init_db()
    allowed_charges, allowed_names, sorted_group_names, sheet_rows = load_roster(xlsx)

    ingest_result: dict | None = None
    if not args.dry_run:
        ingest_result = ingest_project_master_file(xlsx, None)

    db = SessionLocal()
    try:
        projects = db.query(Project).order_by(Project.id).all()
        extras: list[dict] = []
        roster_ids: set[int] = set()
        for p in projects:
            if project_in_roster(p, allowed_charges, allowed_names, sorted_group_names):
                roster_ids.add(p.id)
            else:
                extras.append(
                    {
                        "id": p.id,
                        "charge_code": p.charge_code,
                        "account_name": p.account_name,
                        "filename": p.filename,
                        "client_id": p.client_id,
                    }
                )

        clients = db.query(Client).order_by(Client.id).all()
        extra_clients: list[dict] = []
        for c in clients:
            projs = db.query(Project.id).filter(Project.client_id == c.id).all()
            pids = [r[0] for r in projs]
            if not pids:
                extra_clients.append(
                    {
                        "id": c.id,
                        "official_name": c.official_name,
                        "reason": "no_projects",
                        "project_ids": [],
                    }
                )
                continue
            if all(pid not in roster_ids for pid in pids):
                extra_clients.append(
                    {
                        "id": c.id,
                        "official_name": c.official_name,
                        "reason": "only_off_roster_projects",
                        "project_ids": pids,
                    }
                )
    finally:
        db.close()

    default_report = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../excel_files_imp/account_mapping_sync_report.md")
    )
    report_path = os.path.abspath(args.report) if args.report else default_report

    lines: list[str] = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append(f"# Account mapping sync report\n\nGenerated: {ts}\n")
    lines.append(f"- Source: `{xlsx}`\n")
    lines.append(f"- Sheet0 rows (incl. header row in file): data rows counted = **{sheet_rows}**\n")
    lines.append(f"- Distinct charge codes on sheet: **{len(allowed_charges)}**\n")
    lines.append(f"- Distinct normalized group names on sheet: **{len(allowed_names)}**\n")
    lines.append(f"- DB projects total: **{len(projects)}**\n")
    lines.append(f"- DB projects **on** authoritative roster: **{len(roster_ids)}**\n")
    lines.append(f"- DB projects **not** on roster (review / retire): **{len(extras)}**\n")
    lines.append(f"- DB clients only tied to off-roster (or orphan): **{len(extra_clients)}**\n\n")

    if ingest_result is not None:
        lines.append("## Ingest (`ingest_project_master_file`)\n\n")
        lines.append("```json\n")
        lines.append(json.dumps(ingest_result, indent=2, default=str))
        lines.append("\n```\n\n")

    lines.append("## Projects not on the sheet (by charge code or Group Name match)\n\n")
    lines.append("| id | charge_code | account_name | filename | client_id |\n")
    lines.append("|---:|---|---|---|---:|\n")
    for e in extras:
        lines.append(
            f"| {e['id']} | {e['charge_code'] or '—'} | {str(e['account_name'] or '—')[:80]} | "
            f"{str(e['filename'] or '—')[:40]} | {e['client_id'] or '—'} |\n"
        )
    if not extras:
        lines.append("_None._\n")
    lines.append("\n## Clients to review (no projects, or only projects off the sheet)\n\n")
    lines.append("| client_id | official_name | reason | project_ids |\n")
    lines.append("|---:|---|---|---|\n")
    for e in extra_clients:
        pids = ", ".join(str(x) for x in e["project_ids"][:12])
        if len(e["project_ids"]) > 12:
            pids += ", …"
        lines.append(f"| {e['id']} | {e['official_name'] or '—'} | {e['reason']} | {pids or '—'} |\n")
    if not extra_clients:
        lines.append("_None._\n")

    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("".join(lines))

    print(f"Report written: {report_path}")
    if ingest_result is not None:
        print("Ingest:", json.dumps(ingest_result, default=str))
    print(f"Extra projects: {len(extras)}  |  Clients to review: {len(extra_clients)}")


if __name__ == "__main__":
    main()
