#!/usr/bin/env python3
"""
Load filled excel_upload_masters-style workbooks (row 0 = ORM field names, row 1 = hints) into the DB.

This is *not* the same layout as `ingest_finance.py` (corporate multi-sheet) or `ingest_sla.py` (Base File).

- `10_finance_core` template: `finance_monthly_ledger`, `finance_cash_flow`, `finance_efficiency_kpis`,
  plus `_FK_REFERENCE` to resolve project_id when the data rows have empty project_id.
- `08_sla` template: `metric_definitions`, `sla_performances`, plus `_project_mapping_needed` to bind
  definitions to projects by source_project_name (or `project_id_TO_FILL` if present).

From repo root:
  python3 backend/scripts/ingest_excel_master_filled_workbooks.py \\
    --finance actual_data/10_finance_core_filled.xlsx \\
    --sla actual_data/08_sla_FILLED.xlsx
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, date, time
from typing import Any

import pandas as pd
from sqlalchemy import func

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.database import (  # noqa: E402
    FinanceCashFlow,
    FinanceEfficiencyKPI,
    FinanceMonthlyLedger,
    MetricDefinition,
    Project,
    SLAPerformance,
    SessionLocal,
    backfill_sla_period_starts,
    ensure_project_client,
    init_db,
)
from backend.db.finance_dedupe import dedupe_finance_tables  # noqa: E402


def _read_table_sheet(
    path: str, sheet: str, *, optional: bool = False
) -> pd.DataFrame | None:
    try:
        return pd.read_excel(path, sheet_name=sheet, header=0, skiprows=[1])
    except ValueError:
        if optional:
            return None
        raise


def _read_fk_reference(path: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name="_FK_REFERENCE", header=0)


def _coerce_dt(val: Any) -> datetime | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, date) and not isinstance(val, datetime):
        return datetime.combine(val, time.min)
    t = pd.to_datetime(val, errors="coerce")
    if pd.isna(t):
        return None
    p = t.to_pydatetime()
    if p.tzinfo is not None:
        return p.replace(tzinfo=None)
    return p


def _coerce_date(val: Any) -> date | None:
    d = _coerce_dt(val)
    if d is None:
        return None
    return d.date()


def _coerce_float(val: Any) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return float(val)
    s = str(val).strip()
    if s in ("", "-", "—", "nan", "None"):
        return 0.0
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return 0.0


def _coerce_int(val: Any) -> int:
    f = _coerce_float(val)
    return int(round(f))


def _norm_name(s: str) -> str:
    return " ".join(str(s).strip().split()).lower()


def get_or_create_project(
    db, account_name: str, source_fn: str
) -> Project:
    key = _norm_name(account_name)
    if not key or key == "nan":
        raise ValueError("empty account name")
    p = (
        db.query(Project)
        .filter(func.lower(func.trim(Project.account_name)) == key)
        .first()
    )
    if not p:
        p = Project(
            account_name=" ".join(str(account_name).strip().split()),
            filename=source_fn,
            source_filename=source_fn,
        )
        db.add(p)
        db.flush()
        ensure_project_client(db, p)
    else:
        if p.client_id is None:
            ensure_project_client(db, p)
    return p


def _ledger_allowed_cols() -> set[str]:
    return {
        c.key for c in FinanceMonthlyLedger.__table__.columns
        if c.key not in ("id",)
    } | {"source_filename"}


def _cf_allowed_cols() -> set[str]:
    return {
        c.key for c in FinanceCashFlow.__table__.columns
        if c.key not in ("id",)
    } | {"source_filename"}


def _kpi_allowed_cols() -> set[str]:
    return {
        c.key for c in FinanceEfficiencyKPI.__table__.columns
        if c.key not in ("id",)
    } | {"source_filename"}


def _row_to_model(
    row: pd.Series, allowed: set[str], model_defaults: dict[str, Any]
) -> dict[str, Any]:
    out: dict[str, Any] = dict(model_defaults)
    for k in allowed:
        if k not in row.index:
            continue
        v = row.get(k)
        if v is not None and not (isinstance(v, float) and pd.isna(v)):
            if k in (
                "reporting_month",
                "system_created_at",
                "system_updated_at",
                "metrics_last_updated_at",
                "metrics_updated_at",
            ):
                d = _coerce_dt(v)
                if d is not None:
                    out[k] = d
            elif k in ("metrics_last_updated_by_user_id", "metrics_updated_by_user_id"):
                try:
                    f = _coerce_float(v)
                    if f and f == f:
                        out[k] = int(f)
                except (TypeError, ValueError):
                    pass
            elif k in {
                "budget_value",
                "forecast_value",
                "actual_value",
                "actual_cost",
                "unbilled_amount",
                "collection_target",
                "actual_collected",
                "bad_debt",
                "adjustments",
                "target_revenue_per_recruiter",
                "actual_headcount_wl1",
                "taggd_joiners",
                "target_ppc_inr",
            }:
                out[k] = _coerce_float(v)
            elif k in ("approved_headcount", "actual_headcount_finance"):
                out[k] = _coerce_int(v)
            else:
                if isinstance(v, (int, float, str, bool)) and not (
                    isinstance(v, float) and pd.isna(v)
                ):
                    s = v if isinstance(v, str) else v
                    if not (isinstance(s, str) and str(s).strip() == ""):
                        out[k] = s
    return out


def _build_fk_lists(fk: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    name_col = "project_name"
    fy_col = "fy"
    l2425 = (
        fk[fk[fy_col].astype(str).str.strip() == "FY2024-25"]
        .reset_index()[name_col]
        .astype(str)
        .str.strip()
    )
    l2526 = (
        fk[fk[fy_col].astype(str).str.strip() == "FY2025-26"]
        .reset_index()[name_col]
        .astype(str)
        .str.strip()
    )
    cash_order = l2425.tolist() + l2526[:12].tolist()
    return l2425.tolist(), l2526.tolist(), cash_order


def _ledger_is_full_block(slc: pd.DataFrame) -> bool:
    cat = slc["metric_category"].astype(str).str.lower()
    n_cost = cat.str.contains("cost", na=False) & ~cat.str.contains("contribution", na=False)
    return int(n_cost.sum()) >= 4


def ingest_finance_core_template(path: str, db, source_fn: str) -> dict[str, Any]:
    issues: list[str] = []
    # Re-import should be idempotent even when source_filename inside the workbook varies.
    # Clear prior template-imported finance rows before repopulating.
    db.query(FinanceMonthlyLedger).filter(FinanceMonthlyLedger.uploaded_by == "ingest_excel_master").delete(
        synchronize_session=False
    )
    db.query(FinanceCashFlow).filter(FinanceCashFlow.uploaded_by == "ingest_excel_master").delete(
        synchronize_session=False
    )
    db.query(FinanceEfficiencyKPI).filter(FinanceEfficiencyKPI.uploaded_by == "ingest_excel_master").delete(
        synchronize_session=False
    )
    db.flush()

    l2425, l2526, cash_order = _build_fk_lists(_read_fk_reference(path))
    cash_order_primary = cash_order
    if len(cash_order_primary) != 81:
        issues.append(
            f"Expected 81 project names in primary FK ordering (69 FY24-25 + 12 of FY25-26), got {len(cash_order_primary)}."
        )
    for name in {n for n in l2425 + l2526 if n}:
        if n := str(name).strip():
            get_or_create_project(db, n, source_fn)
    db.flush()

    # --- Ledger: 36 rows per block ---
    # FY24-25: 69 blocks, each 12 months × (Revenue, Contribution Margin, Cost), one project/block.
    # FY25-26: 62 blocks in 31 pairs. Each block-pair contains 3 project streams:
    #   stream A = rows 0:12 from block1 + rows 0:12 from block2
    #   stream B = rows 12:24 from block1 + rows 12:24 from block2
    #   stream C = rows 24:36 from block1 + rows 24:36 from block2
    # Each stream forms 12 months × (Revenue, Contribution Margin) for one FY25-26 project.
    dfl = _read_table_sheet(path, "finance_monthly_ledger", optional=True)
    if dfl is None or dfl.empty:
        issues.append("Sheet finance_monthly_ledger is missing or empty; skipped.")
    else:
        l_allowed = _ledger_allowed_cols() | {"source_filename"}
        n = len(dfl)
        if n < 69 * 36:
            issues.append(f"ledger rows too short for FY24-25 blocks: expected >= {69*36}, got {n}")
        else:
            # FY24-25 import (69 projects)
            for bi in range(69):
                chunk = dfl.iloc[bi * 36 : (bi + 1) * 36]
                if len(chunk) < 36:
                    issues.append(f"FY24 block {bi} incomplete; skipped.")
                    continue
                if bi >= len(l2425):
                    issues.append(f"FY24 block {bi} has no mapped project in _FK_REFERENCE.")
                    continue
                pid = get_or_create_project(db, l2425[bi], source_fn).id
                for m in range(12):
                    o = m * 3
                    r0, r1, r2 = chunk.iloc[o], chunk.iloc[o + 1], chunk.iloc[o + 2]
                    rm = _coerce_dt(r0.get("reporting_month"))
                    if not rm:
                        continue
                    for cat, r in (("Revenue", r0), ("Contribution Margin", r1), ("Cost", r2)):
                        mdl = _row_to_model(r, l_allowed, {"source_filename": source_fn})
                        mdl["project_id"] = pid
                        mdl["reporting_month"] = rm
                        mdl["metric_category"] = cat
                        mdl["source_filename"] = source_fn
                        mdl["uploaded_by"] = mdl.get("uploaded_by") or "ingest_excel_master"
                        _upsert_ledger_row(db, mdl)

            # FY25-26 import (31 block-pairs × 3 streams = 93 projects)
            fy25_start_block = 69
            fy25_pairs = 31
            proj_idx = 0
            for pi in range(fy25_pairs):
                b1 = fy25_start_block + pi * 2
                b2 = b1 + 1
                c1 = dfl.iloc[b1 * 36 : (b1 + 1) * 36]
                c2 = dfl.iloc[b2 * 36 : (b2 + 1) * 36]
                if len(c1) < 36 or len(c2) < 36:
                    issues.append(f"FY25 pair {pi} incomplete (blocks {b1}/{b2}); skipped.")
                    continue
                for seg in range(3):
                    if proj_idx >= len(l2526):
                        issues.append("FY25 stream overflow: more streams than FY25 projects in _FK_REFERENCE.")
                        break
                    pname = l2526[proj_idx]
                    proj_idx += 1
                    pid = get_or_create_project(db, pname, source_fn).id
                    part = pd.concat(
                        [c1.iloc[seg * 12 : (seg + 1) * 12], c2.iloc[seg * 12 : (seg + 1) * 12]],
                        ignore_index=True,
                    )
                    for m in range(12):
                        o = m * 2
                        r0, r1 = part.iloc[o], part.iloc[o + 1]
                        rm = _coerce_dt(r0.get("reporting_month"))
                        if not rm:
                            continue
                        for cat, r in (("Revenue", r0), ("Contribution Margin", r1)):
                            mdl = _row_to_model(r, l_allowed, {"source_filename": source_fn})
                            mdl["project_id"] = pid
                            mdl["reporting_month"] = rm
                            mdl["metric_category"] = cat
                            mdl["source_filename"] = source_fn
                            mdl["uploaded_by"] = mdl.get("uploaded_by") or "ingest_excel_master"
                            _upsert_ledger_row(db, mdl)
            if proj_idx != len(l2526):
                issues.append(f"FY25 project streams consumed {proj_idx}, expected {len(l2526)}.")

    # --- Cash + KPI: 24 rows per project in the sheet, but each block repeats the same 12 months twice ---
    issues.append(
        "finance_cash_flow / finance_efficiency_kpis: each 24-row block is interpreted as two 12-row slices; "
        "slice-to-project mapping is resolved by slice fiscal year (69 FY24-25 slices + 93 FY25-26 slices)."
    )
    for sheet, model, allowed_fn in (
        ("finance_cash_flow", FinanceCashFlow, _cf_allowed_cols),
        ("finance_efficiency_kpis", FinanceEfficiencyKPI, _kpi_allowed_cols),
    ):
        df = _read_table_sheet(path, sheet, optional=True)
        if df is None or df.empty:
            issues.append(f"Sheet {sheet} missing/empty; skipped.")
            continue
        allowed = allowed_fn() | {"source_filename"}
        if len(df) != 81 * 24:
            issues.append(
                f"{sheet}: expected 1944 rows (81 projects × 24 rows; each block duplicates 12 months), got {len(df)}; importing min length."
            )
        max_rows = min(len(df), 81 * 24)
        fy24_idx = 0
        fy25_idx = 0
        for ridx in range(0, max_rows, 24):
            porder = ridx // 24
            if porder >= len(cash_order_primary):
                issues.append(f"{sheet}: row {ridx} exceeds 81 primary project slots; skip rest.")
                break

            for offset in (0, 12):
                first_idx = ridx + offset
                if first_idx >= len(df):
                    continue
                first_row = df.iloc[first_idx]
                rm0 = _coerce_dt(first_row.get("reporting_month"))
                if not rm0:
                    continue
                fy = rm0.year if rm0.month >= 4 else rm0.year - 1
                if fy == 2024:
                    if fy24_idx >= len(l2425):
                        issues.append(f"{sheet}: FY24 slice overflow at row {first_idx}; skipped.")
                        continue
                    pname = l2425[fy24_idx]
                    fy24_idx += 1
                elif fy == 2025:
                    if fy25_idx >= len(l2526):
                        issues.append(f"{sheet}: FY25 slice overflow at row {first_idx}; skipped.")
                        continue
                    pname = l2526[fy25_idx]
                    fy25_idx += 1
                else:
                    issues.append(f"{sheet}: unexpected fiscal year {fy} at row {first_idx}; skipped slice.")
                    continue

                pid = get_or_create_project(db, pname, source_fn).id
                for k in range(12):
                    src_idx = ridx + offset + k
                    if src_idx >= len(df):
                        break
                    row = df.iloc[src_idx]
                    rm = _coerce_dt(row.get("reporting_month"))
                    if not rm:
                        continue
                    mdl = {k: v for k, v in _row_to_model(row, allowed, {"source_filename": source_fn}).items()}
                    mdl["project_id"] = pid
                    mdl["reporting_month"] = rm
                    mdl["source_filename"] = source_fn
                    mdl["uploaded_by"] = mdl.get("uploaded_by") or "ingest_excel_master"
                    if model is FinanceCashFlow:
                        ex = (
                            db.query(FinanceCashFlow)
                            .filter(
                                FinanceCashFlow.project_id == pid,
                                FinanceCashFlow.reporting_month == rm,
                            )
                            .first()
                        )
                        kkw = _model_kwargs(mdl, FinanceCashFlow)
                        if ex:
                            for kk, vv in kkw.items():
                                if hasattr(ex, kk) and kk != "id":
                                    setattr(ex, kk, vv)
                        else:
                            db.add(FinanceCashFlow(**kkw))
                    else:
                        ex = (
                            db.query(FinanceEfficiencyKPI)
                            .filter(
                                FinanceEfficiencyKPI.project_id == pid,
                                FinanceEfficiencyKPI.reporting_month == rm,
                            )
                            .first()
                        )
                        kkw = _model_kwargs(mdl, FinanceEfficiencyKPI)
                        if ex:
                            for kk, vv in kkw.items():
                                if hasattr(ex, kk) and kk != "id":
                                    setattr(ex, kk, vv)
                        else:
                            db.add(FinanceEfficiencyKPI(**kkw))
            db.flush()
        if fy24_idx != len(l2425):
            issues.append(f"{sheet}: consumed FY24 slices {fy24_idx}, expected {len(l2425)}.")
        if fy25_idx != len(l2526):
            issues.append(f"{sheet}: consumed FY25 slices {fy25_idx}, expected {len(l2526)}.")

    dedupe_finance_tables(db)
    return {
        "issues": issues,
        "ledger_blocks": (len(dfl) // 36) if dfl is not None and len(dfl) else 0,
    }


def _model_kwargs(mdl: dict[str, Any], cls) -> dict[str, Any]:
    return {k: v for k, v in mdl.items() if hasattr(cls, k)}


def _upsert_ledger_row(db, mdl: dict[str, Any]) -> None:
    rm = mdl.get("reporting_month")
    pid = mdl.get("project_id")
    cat = mdl.get("metric_category")
    if not isinstance(rm, datetime) or not pid or not cat:
        return
    ex = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.project_id == pid,
            FinanceMonthlyLedger.reporting_month == rm,
            FinanceMonthlyLedger.metric_category == cat,
        )
        .first()
    )
    clean = _model_kwargs(mdl, FinanceMonthlyLedger)
    if ex:
        for k, v in clean.items():
            if k != "id":
                setattr(ex, k, v)
    else:
        db.add(FinanceMonthlyLedger(**clean))


def _md_allowed() -> set[str]:
    return {c.key for c in MetricDefinition.__table__.columns if c.key != "id"} | {
        "source_filename",
    }


def _sp_allowed() -> set[str]:
    return {c.key for c in SLAPerformance.__table__.columns if c.key != "id"} | {"source_filename"}


def ingest_sla_template(path: str, db, source_fn: str) -> dict[str, Any]:
    issues: list[str] = []
    mdf = _read_table_sheet(path, "metric_definitions", optional=True)
    pm = pd.read_excel(path, sheet_name="_project_mapping_needed", header=0)
    if mdf is None or mdf.empty:
        return {"error": "metric_definitions sheet empty", "issues": issues}

    def_to_pid: dict[int, int] = {}
    for _, map_row in pm.iterrows():
        did = int(_coerce_float(map_row.get("definition_id") or 0)) or 0
        if not did:
            continue
        pfill = map_row.get("project_id_TO_FILL")
        pid: int | None
        if pfill is not None and not (isinstance(pfill, float) and pd.isna(pfill)):
            try:
                pid = int(_coerce_float(pfill))
                pr = db.query(Project).filter(Project.id == pid).first()
                if not pr:
                    issues.append(f"definition {did}: project_id_TO_FILL {pid} not in DB; using name")
                    pid = None
            except (TypeError, ValueError):
                pid = None
        else:
            pid = None
        if pid is None:
            pname = str(map_row.get("source_project_name") or "").strip()
            if not pname:
                issues.append(f"definition {did}: no source_project_name / project_id_TO_FILL; skipped.")
                continue
            p = get_or_create_project(db, pname, source_fn)
            pid = p.id
        def_to_pid[did] = pid
    db.flush()

    m_allowed = _md_allowed() | {"source_filename"}
    for _, row in mdf.iterrows():
        iid = row.get("id")
        if iid is None or (isinstance(iid, float) and pd.isna(iid)):
            continue
        eid = int(_coerce_float(iid))
        pid = def_to_pid.get(eid)
        if not pid:
            continue
        ob = (
            db.query(MetricDefinition).filter(MetricDefinition.id == eid).first()
        )
        mdl: dict[str, Any] = {}
        for c in m_allowed:
            if c in row.index:
                mdl[c] = row.get(c)
        mdl["project_id"] = pid
        mdl["source_filename"] = str(mdl.get("source_filename") or source_fn) or source_fn
        mdl["uploaded_by"] = mdl.get("uploaded_by") or "ingest_excel_master"
        for tcol in ("system_created_at", "system_updated_at"):
            d = _coerce_dt(mdl.get(tcol))
            mdl[tcol] = d or datetime.utcnow()
        for tt in ("metric_group", "metric_nature", "target_threshold", "source_system"):
            if tt in mdl and mdl[tt] is not None and str(mdl[tt]) not in ("nan", "NaN", ""):
                mdl[tt] = str(mdl[tt])[:2000]
            elif tt in mdl and (mdl[tt] is None or str(mdl[tt]) in ("nan", "NaN")):
                mdl[tt] = None
        for tt in ("definition", "calculation_method", "formula"):
            if tt in mdl and mdl[tt] is not None and str(mdl[tt]) in ("nan", "NaN"):
                mdl[tt] = ""
        if mdl.get("metric_label") is not None and isinstance(mdl.get("metric_label"), str):
            mdl["metric_label"] = mdl["metric_label"][:2000]
        mdl2 = _model_kwargs(mdl, MetricDefinition)
        if ob:
            for k, v in mdl2.items():
                if k != "id" and hasattr(ob, k):
                    setattr(ob, k, v)
        else:
            mdl2["id"] = eid
            db.add(MetricDefinition(**mdl2))
    db.flush()

    sp = _read_table_sheet(path, "sla_performances", optional=True)
    s_allowed = _sp_allowed() | {"source_filename"}
    if sp is not None and not sp.empty:
        for _, row in sp.iterrows():
            mdl: dict[str, Any] = {}
            for c in s_allowed:
                if c in row.index:
                    mdl[c] = row.get(c)
            did = mdl.get("definition_id")
            if did is None or (isinstance(did, float) and pd.isna(did)):
                continue
            did = int(_coerce_float(did))
            mdl["definition_id"] = did
            mdl["source_filename"] = str(mdl.get("source_filename") or source_fn) or source_fn
            mdl["uploaded_by"] = mdl.get("uploaded_by") or "ingest_excel_master"
            pds = mdl.get("period_start")
            mdl["period_start"] = _coerce_date(pds) if pds is not None and str(pds) not in ("nan", "") else None
            rm = mdl.get("reporting_month")
            rms: str
            if rm is not None and not (isinstance(rm, float) and pd.isna(rm)):
                if isinstance(rm, datetime):
                    rms = rm.strftime("%Y-%m")
                elif isinstance(rm, date):
                    rms = f"{rm.year:04d}-{rm.month:02d}"
                else:
                    ts = pd.to_datetime(rm, errors="coerce")
                    if not pd.isna(ts):
                        rms = ts.strftime("%Y-%m")
                    else:
                        rms = str(rm).strip()[:32]
            else:
                rms = ""
            mdl["reporting_month"] = rms
            for tcol in ("system_created_at", "system_updated_at"):
                d = _coerce_dt(mdl.get(tcol))
                if d:
                    mdl[tcol] = d
            sraw = mdl.get("score")
            if sraw is not None and not (isinstance(sraw, float) and pd.isna(sraw)):
                mdl["score"] = str(sraw)[:200]
            elif isinstance(sraw, float) and pd.isna(sraw):
                mdl["score"] = ""
            rs = mdl.get("rag_status")
            if rs is not None and not (isinstance(rs, float) and pd.isna(rs)):
                mdl["rag_status"] = str(rs)[:64]
            clean = _model_kwargs(mdl, SLAPerformance)
            clean["definition_id"] = did
            clean["source_filename"] = mdl.get("source_filename", source_fn)
            ub = clean.get("uploaded_by")
            if ub is None or (isinstance(ub, float) and pd.isna(ub)) or str(ub) in ("nan", "NaN", ""):
                clean["uploaded_by"] = "ingest_excel_master"
            else:
                clean["uploaded_by"] = str(ub)[:200]
            now = datetime.utcnow()
            for tf in ("system_created_at", "system_updated_at"):
                v = clean.get(tf)
                if v is None or (isinstance(v, float) and (pd.isna(v) or v != v)):
                    clean[tf] = now
                elif not isinstance(v, datetime):
                    d = _coerce_dt(v)
                    clean[tf] = d if d else now

            pstart = mdl.get("period_start")
            eob: SLAPerformance | None
            if pstart is not None:
                eob = (
                    db.query(SLAPerformance)
                    .filter(
                        SLAPerformance.definition_id == did,
                        SLAPerformance.period_start == pstart,
                    )
                    .first()
                )
            else:
                eob = (
                    db.query(SLAPerformance)
                    .filter(
                        SLAPerformance.definition_id == did,
                        SLAPerformance.reporting_month == rms,
                        SLAPerformance.period_start.is_(None),
                    )
                    .first()
                )
            exid = mdl.get("id")
            if eob:
                for k, v in clean.items():
                    if k != "id" and hasattr(eob, k):
                        setattr(eob, k, v)
            elif exid is not None and not (isinstance(exid, float) and pd.isna(exid)):
                eid2 = int(_coerce_float(exid))
                oi = (
                    db.query(SLAPerformance)
                    .filter(SLAPerformance.id == eid2)
                    .first()
                )
                if oi:
                    for k, v in clean.items():
                        if k != "id" and hasattr(oi, k):
                            setattr(oi, k, v)
                else:
                    cl = {a: b for a, b in clean.items() if a != "id" and hasattr(SLAPerformance, a)}
                    cl["id"] = eid2
                    db.add(SLAPerformance(**cl))
            else:
                cl2 = {a: b for a, b in clean.items() if a != "id" and hasattr(SLAPerformance, a)}
                db.add(SLAPerformance(**cl2))
    bf = backfill_sla_period_starts(db)
    if bf:
        issues.append(f"backfill_sla_period_starts adjusted {bf} rows.")
    return {"issues": issues, "metric_definitions": len(mdf)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--finance", type=str, help="Path to 10_finance_core filled .xlsx")
    ap.add_argument("--sla", type=str, help="Path to 08_sla filled .xlsx")
    args = ap.parse_args()
    if not args.finance and not args.sla:
        ap.error("Provide at least one of --finance or --sla")
    init_db()
    db = SessionLocal()
    out: list[str] = []
    try:
        if args.finance:
            fn = os.path.basename(args.finance)
            r = ingest_finance_core_template(args.finance, db, fn)
            db.commit()
            out.append(f"Finance: {r}")
        if args.sla:
            fn = os.path.basename(args.sla)
            r2 = ingest_sla_template(args.sla, db, fn)
            db.commit()
            out.append(f"SLA: {r2}")
        for line in out:
            print(line)
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
