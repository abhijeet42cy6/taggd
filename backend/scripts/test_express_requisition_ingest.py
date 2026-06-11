#!/usr/bin/env python3
"""
Test Express requisition ingestion for tracker workbooks using pinned project logic.

Validates that revenue logic runs (no RestrictedPython builtin errors), derives
global_status, and produces expected revenue for known Joined+CTC rows.

Usage (from repo root):
  python3 backend/scripts/test_express_requisition_ingest.py
  python3 backend/scripts/test_express_requisition_ingest.py --ingest --commit
  python3 backend/scripts/test_express_requisition_ingest.py --case ambuja

Default mode simulates row-level calc from Excel (no DB writes).
With --ingest, runs ExcelProcessor.process_file_into_db (rolls back unless --commit).
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from backend.core.column_mapping_normalize import (  # noqa: E402
    get_status_lexicon_from_mapping,
    split_column_mapping,
)
from backend.core.processor import (  # noqa: E402
    ExcelProcessor,
    _derive_global_status,
    _is_na,
    _safe_float,
)
from backend.core.revenue_logic_loader import (  # noqa: E402
    RevenueLogicCompileError,
    load_calculate_from_source,
)
from backend.core.status_lexicon import merge_global_status_with_revenue  # noqa: E402
from backend.db.database import Project, Record, SessionLocal, init_db  # noqa: E402


@dataclass
class IngestCase:
    slug: str
    label: str
    workbook_globs: list[str]
    project_account: str
    tracker_sheet: str
    """Optional mapping override when workbook layout differs from DB project mapping."""
    mapping_override: Optional[dict[str, Any]] = None
    pos_id_column_override: Optional[str] = None
    """Patch row dict before calculate() so logic sees expected contract/tracker headers."""
    logic_row_patch: Optional[Callable[[dict[str, Any]], dict[str, Any]]] = None
    joined_ctc_min_revenue_rows: int = 0


def _repo_path(*parts: str) -> str:
    return os.path.join(ROOT, *parts)


def _resolve_workbook(patterns: list[str]) -> Optional[str]:
    for pat in patterns:
        path = pat if os.path.isabs(pat) else _repo_path(pat)
        if os.path.isfile(path):
            return path
        hits = sorted(glob.glob(path))
        if hits:
            return hits[-1]
    return None


def _birla_sheet1_logic_patch(row: dict[str, Any]) -> dict[str, Any]:
    """Map Birla_Paint Sheet1 headers to headers expected by pinned Birla revenue logic."""
    out = dict(row)
    out.setdefault("Final Status ", out.get("Current Status") or out.get("Status") or "")
    out.setdefault("Stages", out.get("Stage") or "")
    out.setdefault("Offered CTC", out.get("Total CTC ") or out.get("Fixed CTC ") or out.get("Fixed CTC"))
    out.setdefault("Opening Fees", 0)
    closing = out.get("Closing fees ") or out.get("Closing fee ")
    if closing is not None:
        out.setdefault("Closing fees ", closing)
    return out


BIRLA_SHEET1_MAPPING: dict[str, Any] = {
    "version": 2,
    "universal": {
        "candidate_name": "Candidate Name",
        "position_title": "Role",
        "status": "Current Status",
        "offered_ctc": "Total CTC ",
        "creation_date": "Req Date",
        "location": "Location ",
        "department": "Department ",
    },
    "record_fields": {
        "client_req_id": "ABG Req ID",
        "assigned_recruiter_rpo": "Recruiter ",
        "rpo_stage": "Stage",
        "rpo_zone": "Zone",
    },
}

CASES: list[IngestCase] = [
    IngestCase(
        slug="ambuja",
        label="Ambuja Cement",
        workbook_globs=["excel_files/Ambuja.xlsx"],
        project_account="Ambuja Cement",
        tracker_sheet="Position Tracker",
        joined_ctc_min_revenue_rows=2,
    ),
    IngestCase(
        slug="birla_paint",
        label="Birla Paints",
        workbook_globs=[
            "excel_files/Birla_Paint.xlsx",
            "excel_files/prj33_regen_*_Birla_Paint.xlsx",
            "../tgddata/excel_files/Birla_Paint.xlsx",
        ],
        project_account="Birla Paints",
        tracker_sheet="Sheet1",
        mapping_override=BIRLA_SHEET1_MAPPING,
        pos_id_column_override="ABG Req ID",
        logic_row_patch=_birla_sheet1_logic_patch,
        joined_ctc_min_revenue_rows=0,
    ),
]


@dataclass
class RowSimResult:
    excel_row: int
    position: str
    excel_status: str
    calc_status: str
    revenue: float
    opening_fee: float
    closing_fee: float
    global_status: str
    error: Optional[str] = None


@dataclass
class CaseReport:
    slug: str
    label: str
    workbook: str
    project_id: Optional[int]
    tracker_sheet: str
    excel_data_rows: int = 0
    simulated_rows: int = 0
    calc_errors: int = 0
    calc_error_samples: list[str] = field(default_factory=list)
    global_status_counts: Counter = field(default_factory=Counter)
    revenue_positive_rows: int = 0
    joined_with_ctc_rows: int = 0
    joined_with_revenue_rows: int = 0
    preflight_issues: list[str] = field(default_factory=list)
    row_samples: list[RowSimResult] = field(default_factory=list)
    db_record_count: int = 0
    db_unprocessed: int = 0
    db_calc_error_rows: int = 0
    passed: bool = False
    notes: list[str] = field(default_factory=list)


def _load_project(db, account_name: str) -> Optional[Project]:
    return (
        db.query(Project)
        .filter(Project.account_name.ilike(account_name))
        .order_by(Project.id.desc())
        .first()
    )


def _effective_mapping(project: Project, case: IngestCase) -> dict[str, Any]:
    if case.mapping_override:
        return case.mapping_override
    raw = project.column_mapping
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


def _preflight_mapping(
    df: pd.DataFrame,
    mapping_payload: dict[str, Any],
    logic_code: str,
) -> list[str]:
    issues: list[str] = []
    cols = set(str(c) for c in df.columns)
    uni, rec = split_column_mapping(mapping_payload)
    missing = [h for h in {*uni.values(), *rec.values()} if h and h not in cols]
    if missing:
        issues.append(f"Mapping headers missing in sheet ({len(missing)}): {missing[:8]}")
    for key in ("Opening Fees", "Closing fees ", "Final Status ", "Status", "CTC Offerred"):
        if key in logic_code and key not in cols:
            issues.append(f"Logic references {key!r} but sheet has no such column (use logic_row_patch or remapping).")
    return issues


def _row_passes_sieve(row_dict: dict[str, Any]) -> bool:
    row_text = str(list(row_dict.values())).lower()
    if any(k in row_text for k in ("total", "grand total", "subtotal", "sum of", "balance")):
        return False
    non_empty = sum(1 for v in row_dict.values() if not _is_na(v) and str(v).strip() != "")
    if non_empty < max(1, len(row_dict) * 0.15):
        return False
    name = str(row_dict.get("Candidate Name") or row_dict.get("candidate_name") or "").strip()
    title = str(
        row_dict.get("Position Name")
        or row_dict.get("Role")
        or row_dict.get("Job Role")
        or row_dict.get("position_title")
        or ""
    ).strip()
    req = str(row_dict.get("ABG Req ID") or row_dict.get("Req ID") or row_dict.get("Req id") or "").strip()
    return bool(name or title or req)


def _global_status_for_row(
    calc_results: dict[str, Any],
    status_lexicon: Optional[dict[str, Any]],
    row_canonical_status: str,
) -> str:
    g = _derive_global_status(calc_results)
    if g == "VOID":
        g = "UNPROCESSED"
    if status_lexicon:
        # Minimal path: use canonical status text only when lexicon exists on project
        from backend.core.status_lexicon import lookup_status_entry

        entry = lookup_status_entry(status_lexicon, row_canonical_status)
        g = merge_global_status_with_revenue(entry.get("global_status", "PIPELINE"), calc_results)
    return g


def _simulate_workbook(
    case: IngestCase,
    workbook: str,
    project: Project,
    mapping_payload: dict[str, Any],
    calc_func,
) -> CaseReport:
    report = CaseReport(
        slug=case.slug,
        label=case.label,
        workbook=workbook,
        project_id=project.id,
        tracker_sheet=case.tracker_sheet,
    )
    logic_code = project.revenue_logic_code or ""
    df = pd.read_excel(workbook, sheet_name=case.tracker_sheet)
    report.excel_data_rows = len(df)
    report.preflight_issues = _preflight_mapping(df, mapping_payload, logic_code)

    uni, _rec = split_column_mapping(mapping_payload)
    status_lexicon = get_status_lexicon_from_mapping(mapping_payload)

    for ridx, row in df.iterrows():
        row_dict = {str(k): (None if _is_na(v) else v) for k, v in row.to_dict().items()}
        if not _row_passes_sieve(row_dict):
            continue

        logic_row = dict(row_dict)
        if case.logic_row_patch:
            logic_row = case.logic_row_patch(logic_row)

        position = str(
            row_dict.get(uni.get("position_title", ""), "")
            or row_dict.get("Position Name")
            or row_dict.get("Role")
            or ""
        ).strip()
        excel_status = str(
            row_dict.get(uni.get("status", ""), "")
            or row_dict.get("Status")
            or row_dict.get("Current Status")
            or ""
        ).strip()

        try:
            calc = calc_func(logic_row)
            if not isinstance(calc, dict):
                raise TypeError(f"calculate() returned {type(calc).__name__}, expected dict")
            err = None
            calc_status = str(calc.get("status") or "")
            if calc_status.startswith("Calc Error"):
                report.calc_errors += 1
                if len(report.calc_error_samples) < 5:
                    report.calc_error_samples.append(calc_status)
            revenue = _safe_float(calc.get("revenue"))
            opening = _safe_float(calc.get("opening_fee"))
            closing = _safe_float(calc.get("closing_fee"))
            g_status = _global_status_for_row(calc, status_lexicon, excel_status)
            if revenue > 0:
                report.revenue_positive_rows += 1
            status_low = excel_status.lower()
            ctc_val = logic_row.get("CTC Offerred") or logic_row.get("Offered CTC") or logic_row.get("Total CTC ")
            has_ctc = ctc_val is not None and not _is_na(ctc_val) and str(ctc_val).strip().lower() not in ("", "nan", "-")
            if "joined" in status_low and has_ctc:
                report.joined_with_ctc_rows += 1
                if revenue > 0:
                    report.joined_with_revenue_rows += 1
        except Exception as e:
            err = str(e)
            calc_status = f"Calc Error: {err}"
            revenue = opening = closing = 0.0
            g_status = "UNPROCESSED"
            report.calc_errors += 1
            if len(report.calc_error_samples) < 5:
                report.calc_error_samples.append(calc_status)

        report.simulated_rows += 1
        report.global_status_counts[g_status] += 1
        if len(report.row_samples) < 8:
            report.row_samples.append(
                RowSimResult(
                    excel_row=int(ridx) + 2,
                    position=position[:40],
                    excel_status=excel_status[:30],
                    calc_status=calc_status[:40],
                    revenue=revenue,
                    opening_fee=opening,
                    closing_fee=closing,
                    global_status=g_status,
                    error=err,
                )
            )

    return report


def _db_snapshot(db, project_id: int) -> tuple[int, int, int]:
    rows = db.query(Record).filter(Record.project_id == project_id).all()
    unproc = sum(1 for r in rows if (r.global_status or "") == "UNPROCESSED")
    calc_err = 0
    for r in rows:
        rr = r.revenue_results if isinstance(r.revenue_results, dict) else {}
        st = str((rr or {}).get("status") or "")
        if st.startswith("Calc Error") or "not defined" in st.lower():
            calc_err += 1
    return len(rows), unproc, calc_err


def _run_ingest(
    db,
    case: IngestCase,
    workbook: str,
    project: Project,
    mapping_payload: dict[str, Any],
    calc_func,
    commit: bool,
) -> None:
    pos_col = case.pos_id_column_override or project.pos_id_column
    if pos_col:
        project.pos_id_column = pos_col
    project.tracker_sheet = case.tracker_sheet
    processor = ExcelProcessor(db)
    processor.process_file_into_db(
        project.id,
        workbook,
        case.tracker_sheet,
        mapping_payload,
        calc_func,
    )
    if not commit:
        db.rollback()
    else:
        db.commit()


def _evaluate_pass(report: CaseReport, case: IngestCase, ingest_committed: bool) -> bool:
    """Simulation must be clean; DB calc errors only fail after a committed ingest."""
    if report.calc_errors > 0:
        return False
    if report.simulated_rows == 0:
        return False
    if case.joined_ctc_min_revenue_rows > 0 and report.joined_with_revenue_rows < case.joined_ctc_min_revenue_rows:
        return False
    if ingest_committed and report.db_calc_error_rows > 0:
        return False
    return True


def _print_report(
    report: CaseReport,
    case: IngestCase,
    ingest_ran: bool,
    committed: bool,
) -> None:
    print("\n" + "=" * 72)
    print(f"CASE: {report.label} ({report.slug})")
    print("=" * 72)
    print(f"  Workbook:      {report.workbook}")
    print(f"  Project id:    {report.project_id}")
    print(f"  Tracker sheet: {report.tracker_sheet}")
    print(f"  Excel rows:    {report.excel_data_rows} (simulated {report.simulated_rows} after sieve)")
    if report.preflight_issues:
        print("  Preflight:")
        for issue in report.preflight_issues:
            print(f"    - {issue}")
    print(f"  Calc errors:   {report.calc_errors}")
    if report.calc_error_samples:
        print(f"  Error samples: {report.calc_error_samples}")
    print(f"  Global status: {dict(report.global_status_counts)}")
    print(f"  Revenue > 0:   {report.revenue_positive_rows}")
    print(f"  Joined+CTC:    {report.joined_with_ctc_rows} (with revenue: {report.joined_with_revenue_rows})")
    if ingest_ran:
        print(f"  DB records:    {report.db_record_count} (UNPROCESSED: {report.db_unprocessed}, calc errors: {report.db_calc_error_rows})")
        print(f"  Ingest commit: {committed}")
    print("  Sample rows:")
    for s in report.row_samples:
        print(
            f"    row {s.excel_row:>3} | {s.position[:22]:22} | {s.excel_status[:14]:14} | "
            f"calc={s.calc_status[:18]:18} | rev={s.revenue:,.0f} | g={s.global_status}"
        )
    report.passed = _evaluate_pass(report, case, ingest_committed=ingest_ran and committed)
    mode = "simulate"
    if ingest_ran:
        mode = "ingest+commit" if committed else "ingest(rollback)"
    print(f"  RESULT ({mode}): {'PASS' if report.passed else 'FAIL'}")
    if report.notes:
        for n in report.notes:
            print(f"  Note: {n}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Test Express requisition ingest for Ambuja & Birla_Paint.")
    ap.add_argument("--case", choices=[c.slug for c in CASES], help="Run a single case")
    ap.add_argument("--ingest", action="store_true", help="Run ExcelProcessor ingest (default: simulate only)")
    ap.add_argument("--commit", action="store_true", help="Commit DB changes after --ingest (default: rollback)")
    args = ap.parse_args()

    init_db()
    db = SessionLocal()
    cases = [c for c in CASES if not args.case or c.slug == args.case]
    any_fail = False

    try:
        for case in cases:
            workbook = _resolve_workbook(case.workbook_globs)
            if not workbook:
                print(f"FAIL {case.slug}: workbook not found — tried {case.workbook_globs}")
                any_fail = True
                continue

            project = _load_project(db, case.project_account)
            if not project or not project.revenue_logic_code:
                print(f"FAIL {case.slug}: project {case.project_account!r} missing or has no revenue_logic_code")
                any_fail = True
                continue

            try:
                calc_func = load_calculate_from_source(project.revenue_logic_code)
            except RevenueLogicCompileError as e:
                print(f"FAIL {case.slug}: logic compile error: {e}")
                any_fail = True
                continue

            mapping_payload = _effective_mapping(project, case)
            report = _simulate_workbook(case, workbook, project, mapping_payload, calc_func)

            if case.mapping_override and not case.logic_row_patch:
                report.notes.append("Using mapping_override for ingest/simulate.")

            if args.ingest:
                before = _db_snapshot(db, project.id)
                _run_ingest(db, case, workbook, project, mapping_payload, calc_func, commit=args.commit)
                after = _db_snapshot(db, project.id)
                report.db_record_count = after[0]
                report.db_unprocessed = after[1]
                report.db_calc_error_rows = after[2]
                if args.commit:
                    report.notes.append(f"DB records before→after: {before[0]}→{after[0]}")
                else:
                    report.notes.append("Ingest rolled back (dry-run). Use --commit to persist.")
            else:
                cnt, unproc, cerr = _db_snapshot(db, project.id)
                report.db_record_count = cnt
                report.db_unprocessed = unproc
                report.db_calc_error_rows = cerr
                if cerr:
                    report.notes.append(
                        f"Existing DB has {cerr} row(s) with calc errors — re-run with --ingest --commit to refresh."
                    )

            _print_report(report, case, ingest_ran=args.ingest, committed=args.commit)
            if not report.passed:
                any_fail = True
    finally:
        db.close()

    print("\n" + ("ALL CASES PASSED" if not any_fail else "SOME CASES FAILED"))
    return 1 if any_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
