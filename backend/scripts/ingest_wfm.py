"""
Ingest WFM (Projected Headcount & Revenue) workbook into wfm_hr_benchmarks, projects,
and wfm_resource_gaps (open requisitions sheet).

Sheet selection:
  - Primary: "Projected HC - FY26" (exact)
  - Fallback: first sheet whose name contains "Projected HC" (case-insensitive) and does not
    contain "(Q4)" — the Q4-only layout uses different column semantics at the same indices.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import re
import sys
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.sla_project_resolve import resolve_project_for_sla
from backend.db.database import (
    Project,
    SessionLocal,
    WFMHRBenchmark,
    WFMResourceGap,
    ensure_project_client,
    init_db,
)

logger = logging.getLogger(__name__)

WFM_UPLOADED_BY = "ingest_wfm_master"
PRIMARY_HC_SHEET = "Projected HC - FY26"


def _log(lines: list[str], msg: str, level: str = "info") -> None:
    lines.append(msg)
    getattr(logger, level, logger.info)(msg)


def _safe_float(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (int, float)) and not pd.isna(val):
        return float(val)
    s = str(val).strip().replace(",", "")
    if not s or s.lower() in ("nan", "none", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _safe_int(val: Any) -> int:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0
    if isinstance(val, bool):
        return int(val)
    if isinstance(val, (int, float)) and not pd.isna(val):
        try:
            return int(round(float(val)))
        except (ValueError, OverflowError):
            return 0
    s = str(val).strip().replace(",", "")
    if not s or s.lower() in ("nan", "none", "-"):
        return 0
    if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
        try:
            return int(s)
        except ValueError:
            return 0
    try:
        return int(round(float(s)))
    except ValueError:
        return 0


def _fy_reporting_date_from_sheet(df: pd.DataFrame) -> dt.datetime:
    """Parse FYxx from top rows; Indian FY start April 1 (FY26 -> 2025-04-01)."""
    for ridx in range(min(3, len(df))):
        row = df.iloc[ridx]
        for cidx in range(min(row.shape[0], 40)):
            cell = row.iloc[cidx]
            if cell is None or (isinstance(cell, float) and pd.isna(cell)):
                continue
            s = str(cell).strip().upper()
            m = re.search(r"FY\s*(\d{2})", s)
            if not m:
                m = re.search(r"^FY(\d{2})$", s)
            if m:
                yy = int(m.group(1))
                year_start = 2000 + yy - 1
                return dt.datetime(year_start, 4, 1, 0, 0, 0)
    return dt.datetime(2025, 4, 1, 0, 0, 0)


def _pick_projected_hc_sheet(xl: pd.ExcelFile) -> str:
    if PRIMARY_HC_SHEET in xl.sheet_names:
        return PRIMARY_HC_SHEET
    for name in xl.sheet_names:
        low = name.lower()
        if "projected hc" in low and "(q4)" not in low:
            return name
    raise ValueError(
        "No suitable WFM sheet found. Expected "
        f"{PRIMARY_HC_SHEET!r} or a sheet named like 'Projected HC - FY27' "
        f"(not a Q4-only tab). Available: {', '.join(xl.sheet_names[:15])}"
    )


def _open_positions_sheet_name(names: list[str]) -> Optional[str]:
    for n in names:
        low = n.lower().replace("'", "")
        if "open" in low and "posit" in low:
            return n
    return None


def _ingest_open_positions(
    db: Session, file_path: str, source_fn: str, logs: list[str]
) -> int:
    xl = pd.ExcelFile(file_path)
    sn = _open_positions_sheet_name(xl.sheet_names)
    if not sn:
        _log(logs, "No 'Open Position' sheet found; skipping wfm_resource_gaps.")
        return 0
    df = pd.read_excel(file_path, sheet_name=sn, header=0)
    if df.empty:
        _log(logs, f"Sheet {sn!r} is empty; no gaps ingested.")
        return 0

    deleted = (
        db.query(WFMResourceGap)
        .filter(WFMResourceGap.uploaded_by == WFM_UPLOADED_BY)
        .delete(synchronize_session=False)
    )
    _log(logs, f"Open positions: cleared {deleted} prior auto-ingested gap row(s).")

    written = 0
    skipped = 0
    for _, row in df.iterrows():
        rid = row.get("Requisition ID")
        if rid is None or (isinstance(rid, float) and pd.isna(rid)):
            skipped += 1
            continue
        req_id = str(rid).strip()
        if not req_id or req_id.lower() == "nan":
            skipped += 1
            continue

        client_raw = row.get("Client")
        client = str(client_raw).strip() if pd.notnull(client_raw) else ""
        if not client:
            skipped += 1
            continue

        project, _reason = resolve_project_for_sla(db, client)
        if not project:
            skipped += 1
            continue
        if project.client_id is None:
            ensure_project_client(db, project)

        req_stat = row.get("Requisition Status")
        cand_stat = row.get("Status")
        status_parts = []
        if pd.notnull(req_stat):
            status_parts.append(str(req_stat).strip())
        if pd.notnull(cand_stat):
            status_parts.append(str(cand_stat).strip())
        status_s = " / ".join(status_parts)[:500] if status_parts else None

        hiring_type = row.get("Req Type")
        hiring_s = str(hiring_type).strip()[:200] if pd.notnull(hiring_type) else None

        wl = row.get("Work Level")
        designation = str(wl).strip()[:64] if pd.notnull(wl) else None

        target_d: Optional[dt.datetime] = None
        for key in ("Date of joining", "Date of offer"):
            raw = row.get(key)
            if raw is None or (isinstance(raw, float) and pd.isna(raw)):
                continue
            ts = pd.to_datetime(raw, errors="coerce")
            if pd.isna(ts):
                continue
            if hasattr(ts, "to_pydatetime"):
                target_d = ts.to_pydatetime()
            else:
                target_d = dt.datetime.fromtimestamp(ts.timestamp())
            break

        gap = (
            db.query(WFMResourceGap)
            .filter(
                WFMResourceGap.project_id == project.id,
                WFMResourceGap.req_id == req_id,
            )
            .first()
        )
        if not gap:
            gap = WFMResourceGap(project_id=project.id, req_id=req_id)
            db.add(gap)

        gap.status = status_s
        gap.hiring_type = hiring_s
        gap.designation_level = designation
        gap.target_date = target_d
        gap.source_filename = source_fn
        gap.uploaded_by = WFM_UPLOADED_BY
        written += 1

    _log(logs, f"Open positions: wrote {written} gap row(s); skipped {skipped} (no req/client/project).")
    return written


def ingest_wfm_master(file_path: str, db: Optional[Session] = None) -> dict[str, Any]:
    logs: list[str] = []
    result: dict[str, Any] = {
        "ok": False,
        "file": os.path.basename(file_path),
        "logs": logs,
        "projects_touched": 0,
        "benchmarks_saved": 0,
        "gap_rows_written": 0,
        "sheet_used": None,
        "reporting_date": None,
    }

    if not os.path.exists(file_path):
        _log(logs, f"File not found: {file_path}", "error")
        result["error"] = "File not found"
        return result

    init_db()

    external = db is not None
    if not external:
        db = SessionLocal()

    source_fn = os.path.basename(file_path)

    try:
        xl = pd.ExcelFile(file_path)
        sheet = _pick_projected_hc_sheet(xl)
        result["sheet_used"] = sheet
        _log(logs, f"Using sheet: {sheet!r}")

        df = pd.read_excel(file_path, sheet_name=sheet, header=None)
        reporting_date = _fy_reporting_date_from_sheet(df)
        result["reporting_date"] = reporting_date.isoformat()
        _log(logs, f"Reporting snapshot date (FY start): {reporting_date.date()}")

        data_rows = df.iloc[3:]
        projects_touched = 0
        benchmarks_saved = 0

        for _idx, row in data_rows.iterrows():
            cust_cell = row.iloc[0] if len(row) > 0 else None
            cust_id = str(cust_cell).strip() if pd.notnull(cust_cell) else ""
            if not cust_id or cust_id.lower() == "nan" or "CNO" not in cust_id:
                continue

            name_edb = row.iloc[2] if len(row) > 2 else None
            name_short = row.iloc[1] if len(row) > 1 else None
            account_label = (
                str(name_edb).strip()
                if pd.notnull(name_edb) and str(name_edb).strip().lower() != "nan"
                else (str(name_short).strip() if pd.notnull(name_short) else "")
            )
            if not account_label:
                continue

            industry = str(row.iloc[3]).strip() if len(row) > 3 and pd.notnull(row.iloc[3]) else ""
            fh = str(row.iloc[6]).strip() if len(row) > 6 and pd.notnull(row.iloc[6]) else ""
            ph = str(row.iloc[7]).strip() if len(row) > 7 and pd.notnull(row.iloc[7]) else ""
            region = str(row.iloc[8]).strip() if len(row) > 8 and pd.notnull(row.iloc[8]) else ""

            rev_total = _safe_float(row.iloc[14]) if len(row) > 14 else None
            target_hc = _safe_float(row.iloc[20]) if len(row) > 20 else None
            target_prod = _safe_float(row.iloc[26]) if len(row) > 26 else None
            ideal_hc = _safe_float(row.iloc[32]) if len(row) > 32 else None

            wl1_c = _safe_int(row.iloc[34]) if len(row) > 34 else 0
            wl2_c = _safe_int(row.iloc[35]) if len(row) > 35 else 0
            wl3_c = _safe_int(row.iloc[36]) if len(row) > 36 else 0
            wl4_c = _safe_int(row.iloc[37]) if len(row) > 37 else 0
            actual_total = _safe_int(row.iloc[38]) if len(row) > 38 else 0

            rph = _safe_float(row.iloc[9]) if len(row) > 9 else None
            var_bench = _safe_float(row.iloc[39]) if len(row) > 39 else None
            var_after = _safe_float(row.iloc[46]) if len(row) > 46 else None

            op_wl1 = _safe_int(row.iloc[41]) if len(row) > 41 else 0
            op_wl2 = _safe_int(row.iloc[42]) if len(row) > 42 else 0
            op_wl3 = _safe_int(row.iloc[43]) if len(row) > 43 else 0
            op_wl4 = _safe_int(row.iloc[44]) if len(row) > 44 else 0
            op_total = _safe_int(row.iloc[45]) if len(row) > 45 else 0

            sheet_metrics: dict[str, Any] = {
                "charge_code": cust_id,
                "function_head": fh,
                "rph_cph_inr": rph,
                "lateral_revenue": {
                    "q1": _safe_float(row.iloc[10]) if len(row) > 10 else None,
                    "q2": _safe_float(row.iloc[11]) if len(row) > 11 else None,
                    "q3": _safe_float(row.iloc[12]) if len(row) > 12 else None,
                    "q4": _safe_float(row.iloc[13]) if len(row) > 13 else None,
                    "ytd": rev_total,
                },
                "lateral_hc": {
                    "q1": _safe_float(row.iloc[16]) if len(row) > 16 else None,
                    "q2": _safe_float(row.iloc[17]) if len(row) > 17 else None,
                    "q3": _safe_float(row.iloc[18]) if len(row) > 18 else None,
                    "q4": _safe_float(row.iloc[19]) if len(row) > 19 else None,
                    "ytd": target_hc,
                },
                "lateral_productivity": {
                    "q1": _safe_float(row.iloc[22]) if len(row) > 22 else None,
                    "q2": _safe_float(row.iloc[23]) if len(row) > 23 else None,
                    "q3": _safe_float(row.iloc[24]) if len(row) > 24 else None,
                    "q4": _safe_float(row.iloc[25]) if len(row) > 25 else None,
                    "ytd": target_prod,
                },
                "ideal_hc_by_wl": {
                    "wl1": _safe_float(row.iloc[28]) if len(row) > 28 else None,
                    "wl2": _safe_float(row.iloc[29]) if len(row) > 29 else None,
                    "wl3": _safe_float(row.iloc[30]) if len(row) > 30 else None,
                    "wl4": _safe_float(row.iloc[31]) if len(row) > 31 else None,
                    "total": ideal_hc,
                },
                "open_positions": {
                    "wl1": op_wl1,
                    "wl2": op_wl2,
                    "wl3": op_wl3,
                    "wl4": op_wl4,
                    "total": op_total,
                },
                "variance": {
                    "hc_bench": var_bench,
                    "after_hiring": var_after,
                },
            }

            project, match_reason = resolve_project_for_sla(db, account_label)
            if not project:
                project = Project(
                    account_name=account_label.strip(),
                    filename=source_fn,
                    source_filename=source_fn,
                )
                db.add(project)
                db.flush()
                ensure_project_client(db, project)
                _log(logs, f"Created project {account_label!r} (no resolver match).")
            elif project.client_id is None:
                ensure_project_client(db, project)

            if industry:
                project.vertical = industry
            if ph:
                project.practice_head = ph
            if fh:
                project.function_head = fh
            if region:
                project.region = region
            project.source_filename = source_fn
            if not (project.charge_code or "").strip():
                project.charge_code = cust_id

            benchmark = (
                db.query(WFMHRBenchmark)
                .filter(
                    WFMHRBenchmark.project_id == project.id,
                    WFMHRBenchmark.reporting_date == reporting_date,
                )
                .first()
            )
            if not benchmark:
                benchmark = WFMHRBenchmark(
                    project_id=project.id,
                    reporting_date=reporting_date,
                    source_filename=source_fn,
                )
                db.add(benchmark)

            benchmark.lateral_revenue_target = rev_total or 0.0
            benchmark.lateral_hc_target = target_hc or 0.0
            benchmark.lateral_productivity_target = target_prod or 0.0
            benchmark.ideal_hc = ideal_hc or 0.0
            benchmark.actual_hc_total = actual_total
            benchmark.wl1_hires = wl1_c
            benchmark.wl2_hires = wl2_c
            benchmark.wl3_hires = wl3_c
            benchmark.wl4_hires = wl4_c
            benchmark.source_filename = source_fn
            benchmark.uploaded_by = WFM_UPLOADED_BY
            benchmark.sheet_metrics_json = sheet_metrics

            projects_touched += 1
            benchmarks_saved += 1

        gap_n = _ingest_open_positions(db, file_path, source_fn, logs)

        db.commit()
        result.update(
            {
                "ok": True,
                "projects_touched": projects_touched,
                "benchmarks_saved": benchmarks_saved,
                "gap_rows_written": gap_n,
                "match_hint": "projects resolved via resolve_project_for_sla",
            }
        )
        _log(
            logs,
            f"Commit OK — benchmarks={benchmarks_saved}, projects_touched={projects_touched}, gaps={gap_n}.",
        )
        return result

    except Exception as e:
        db.rollback()
        _log(logs, f"FATAL: {e}", "error")
        logger.exception("WFM ingest failed")
        for line in str(e).split("\n"):
            logs.append(f"  {line}")
        result["error"] = str(e)
        return result
    finally:
        if not external:
            db.close()


if __name__ == "__main__":
    _root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    default_path = os.path.join(_root, "excel_files_imp", "WFM (Projected Headcount & Revenue).xlsx")
    target = sys.argv[1] if len(sys.argv) > 1 else default_path
    out = ingest_wfm_master(target)
    print(json.dumps(out, indent=2, default=str))
