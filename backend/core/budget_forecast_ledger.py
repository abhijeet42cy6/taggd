"""
Budget / forecast template → `finance_monthly_ledger` (finer metric_category).

Legacy `project_budgets` / `project_forecasts` migration + drop handled in `database.init_db`.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.finance_planning_categories import (
    PLANNING_FORECAST_CATEGORIES,
    WATERFALL_MMF_CATEGORY,
    forecast_detail_to_category,
    indian_fy_month_starts,
    metric_label_from_category,
    normalize_forecast_cell_inr,
    parse_fy_label_to_start_year,
    quarter_slices,
)
from backend.db.database import FinanceMonthlyLedger, Project, Record
from backend.db.finance_dedupe import dedupe_finance_tables


BF_SOURCE_PREFIX = "budget_forecast:"
BF_UPLOADED_BY_PREFIX = "bf:"


def _month_key(d: dt.datetime) -> dt.datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _upsert_ledger_row(
    db: Session,
    *,
    project_id: int | None,
    reporting_month: dt.datetime,
    metric_category: str,
    budget_value: float | None = None,
    forecast_value: float | None = None,
    actual_value: float | None = None,
    source_filename: str | None,
    uploaded_by: str | None,
) -> None:
    rm = _month_key(reporting_month)
    q = db.query(FinanceMonthlyLedger).filter(
        FinanceMonthlyLedger.project_id == project_id,
        FinanceMonthlyLedger.reporting_month == rm,
        FinanceMonthlyLedger.metric_category == metric_category,
    )
    row = q.first()
    if not row:
        row = FinanceMonthlyLedger(
            project_id=project_id,
            reporting_month=rm,
            metric_category=metric_category,
            budget_value=0.0,
            forecast_value=0.0,
            actual_value=0.0,
            source_filename=source_filename,
            uploaded_by=uploaded_by,
        )
        db.add(row)
    if budget_value is not None:
        row.budget_value = float(budget_value)
    if forecast_value is not None:
        row.forecast_value = float(forecast_value)
    if actual_value is not None:
        row.actual_value = float(actual_value)
    if source_filename:
        row.source_filename = source_filename
    if uploaded_by:
        row.uploaded_by = uploaded_by


def clear_budget_forecast_ledger_for_projects(db: Session, project_ids: list[int]) -> None:
    if not project_ids:
        return
    db.query(FinanceMonthlyLedger).filter(
        FinanceMonthlyLedger.project_id.in_(project_ids),
        FinanceMonthlyLedger.metric_category.in_(PLANNING_FORECAST_CATEGORIES),
    ).delete(synchronize_session=False)


def apply_quarterly_revenue_budget(
    db: Session,
    project_id: int,
    fy_start_year: int,
    q1: float,
    q2: float,
    q3: float,
    q4: float,
    *,
    source_filename: str,
    uploaded_by: str,
) -> None:
    months = indian_fy_month_starts(fy_start_year)
    q1m, q2m, q3m, q4m = quarter_slices(months)
    splits = (
        [q1 / 3.0] * 3
        + [q2 / 3.0] * 3
        + [q3 / 3.0] * 3
        + [q4 / 3.0] * 3
    )
    for m, b in zip(months, splits):
        _upsert_ledger_row(
            db,
            project_id=project_id,
            reporting_month=m,
            metric_category="Revenue",
            budget_value=b,
            source_filename=source_filename,
            uploaded_by=uploaded_by,
        )


def ingest_budget_forecast_workbook(
    db: Session,
    *,
    df_budget: Any,
    df_forecast: Any,
    name_to_id: dict[str, int | None],
    safe_filename: str,
) -> int:
    """
    Write budget Q→Revenue monthly budget and forecast lines to ledger.
    Returns count of matched project ids touched.
    """
    source_fn = f"{BF_SOURCE_PREFIX}{safe_filename}"
    matched_ids = {pid for pid in name_to_id.values() if pid is not None}
    if matched_ids:
        clear_budget_forecast_ledger_for_projects(db, list(matched_ids))

    lakh = 100_000.0
    for _, row in df_budget.iterrows():
        project_csv_name = str(row.get("Project", "")).strip()
        pid = name_to_id.get(project_csv_name)
        if pid is None:
            continue
        fy_label = row.get("FY'26", row.get("FY", None))
        fy_start = parse_fy_label_to_start_year(str(fy_label) if fy_label is not None else "")
        q1 = float(row.get("Q1", 0) or 0) * lakh
        q2 = float(row.get("Q2", 0) or 0) * lakh
        q3 = float(row.get("Q3", 0) or 0) * lakh
        q4 = float(row.get("Q4", 0) or 0) * lakh
        ub = f"{BF_UPLOADED_BY_PREFIX}{project_csv_name}"
        apply_quarterly_revenue_budget(
            db,
            int(pid),
            fy_start,
            q1,
            q2,
            q3,
            q4,
            source_filename=source_fn,
            uploaded_by=ub,
        )

    import pandas as pd

    df_forecast = df_forecast.copy()
    df_forecast["Project"] = df_forecast["Project"].ffill()
    month_cols = [c for c in df_forecast.columns if isinstance(c, (dt.datetime, pd.Timestamp))]
    for _, row in df_forecast.iterrows():
        project_csv_name = str(row.get("Project", "")).strip()
        pid = name_to_id.get(project_csv_name)
        detail = str(row.get("Detail", "Unspecified"))
        cat = forecast_detail_to_category(detail)
        ub = f"{BF_UPLOADED_BY_PREFIX}{project_csv_name}"
        for month_dt in month_cols:
            raw = row[month_dt]
            if raw is None or (isinstance(raw, float) and pd.isna(raw)):
                val = 0.0
            else:
                val = float(raw)
            # Joiner row is a headcount forecast, not INR (legacy template had no Lakh scaling).
            if cat == "Forecast_Joiners":
                val_inr = val
            else:
                val_inr = normalize_forecast_cell_inr(val)
            _upsert_ledger_row(
                db,
                project_id=int(pid) if pid is not None else None,
                reporting_month=month_dt,
                metric_category=cat,
                forecast_value=val_inr,
                source_filename=source_fn,
                uploaded_by=ub,
            )

    db.commit()
    dedupe_finance_tables(db)
    return len(matched_ids)


def update_budget_quarters(
    db: Session,
    project_id: int,
    q1: float,
    q2: float,
    q3: float,
    q4: float,
    *,
    fy_start_year: int | None = None,
) -> None:
    fy = fy_start_year or parse_fy_label_to_start_year("")
    source_fn = f"{BF_SOURCE_PREFIX}manual_edit"
    ub = f"{BF_UPLOADED_BY_PREFIX}manual:{project_id}"
    apply_quarterly_revenue_budget(
        db,
        project_id,
        fy,
        q1,
        q2,
        q3,
        q4,
        source_filename=source_fn,
        uploaded_by=ub,
    )
    db.commit()
    dedupe_finance_tables(db)


def update_forecast_metrics(
    db: Session,
    project_id: int,
    mmf: float,
    joiner: float,
    joining_fee: float,
    *,
    target_month: dt.datetime | None = None,
) -> None:
    """Single-month patch for the three primary UI metrics."""
    if target_month is None:
        existing = (
            db.query(FinanceMonthlyLedger)
            .filter(
                FinanceMonthlyLedger.project_id == project_id,
                FinanceMonthlyLedger.metric_category == "Revenue_MMF",
            )
            .order_by(FinanceMonthlyLedger.reporting_month.asc())
            .first()
        )
        target_month = existing.reporting_month if existing else dt.datetime(2026, 1, 1)
    t = _month_key(target_month)
    source_fn = f"{BF_SOURCE_PREFIX}manual_edit"
    ub = f"{BF_UPLOADED_BY_PREFIX}manual:{project_id}"
    _upsert_ledger_row(
        db,
        project_id=project_id,
        reporting_month=t,
        metric_category="Revenue_MMF",
        forecast_value=float(mmf),
        source_filename=source_fn,
        uploaded_by=ub,
    )
    _upsert_ledger_row(
        db,
        project_id=project_id,
        reporting_month=t,
        metric_category="Forecast_Joiners",
        forecast_value=float(joiner),
        source_filename=source_fn,
        uploaded_by=ub,
    )
    _upsert_ledger_row(
        db,
        project_id=project_id,
        reporting_month=t,
        metric_category="Revenue_JoiningFee",
        forecast_value=float(joining_fee),
        source_filename=source_fn,
        uploaded_by=ub,
    )
    db.commit()
    dedupe_finance_tables(db)


def recalculate_budget_forecast_links(db: Session, scoped_projects: list[Project]) -> int:
    """Fuzzy-link ledger rows (uploaded_by bf:*) to projects by name."""
    rows = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.uploaded_by.isnot(None),
            FinanceMonthlyLedger.uploaded_by.like(f"{BF_UPLOADED_BY_PREFIX}%"),
            FinanceMonthlyLedger.project_id.is_(None),
        )
        .all()
    )
    matched = 0
    for ledger_row in rows:
        raw = (ledger_row.uploaded_by or "").removeprefix(BF_UPLOADED_BY_PREFIX).strip()
        if raw.startswith("manual:"):
            continue
        raw_l = raw.lower()
        for p in scoped_projects:
            p_name = (p.filename or "").replace(" Tracker.xlsx", "").replace(".xlsx", "").strip().lower()
            if not p_name:
                continue
            if p_name in raw_l or raw_l in p_name:
                ledger_row.project_id = p.id
                matched += 1
                break
    db.commit()
    dedupe_finance_tables(db)
    return matched


def build_budget_forecast_data_payload(db: Session, scoped_project_ids: set[int] | None) -> dict[str, Any]:
    from sqlalchemy import func

    if scoped_project_ids is not None and len(scoped_project_ids) == 0:
        return {
            "summary": {"total_budget": 0.0, "total_actual": 0.0, "variance": 0.0},
            "budgets": [],
            "forecasts": [],
        }

    q_led = db.query(FinanceMonthlyLedger).filter(FinanceMonthlyLedger.metric_category == "Revenue")
    if scoped_project_ids is not None:
        q_led = q_led.filter(FinanceMonthlyLedger.project_id.in_(scoped_project_ids))
    rev_rows = q_led.all()

    q_proj = db.query(Project)
    if scoped_project_ids is not None:
        q_proj = q_proj.filter(Project.id.in_(scoped_project_ids))
    projects = {p.id: p for p in q_proj.all()}

    by_pid: dict[int, list[FinanceMonthlyLedger]] = {}
    for r in rev_rows:
        if r.project_id is None:
            continue
        by_pid.setdefault(int(r.project_id), []).append(r)

    budget_results: list[dict[str, Any]] = []
    for pid, led_rows in by_pid.items():
        p = projects.get(pid)
        if not p:
            continue
        fy_totals: dict[int, float] = {}
        for lr in led_rows:
            m = lr.reporting_month
            if not m:
                continue
            fy_start = m.year if m.month >= 4 else m.year - 1
            fy_totals[fy_start] = fy_totals.get(fy_start, 0.0) + float(lr.budget_value or 0)

        best_fy = max(fy_totals, key=lambda k: fy_totals[k]) if fy_totals else parse_fy_label_to_start_year("")
        months = indian_fy_month_starts(best_fy)
        q1m, q2m, q3m, q4m = quarter_slices(months)

        def _sum_budget(ms: list[dt.datetime]) -> float:
            s = 0.0
            for m in ms:
                mk = _month_key(m)
                for lr in led_rows:
                    if lr.reporting_month and _month_key(lr.reporting_month) == mk:
                        s += float(lr.budget_value or 0)
            return s

        q1, q2, q3, q4 = _sum_budget(q1m), _sum_budget(q2m), _sum_budget(q3m), _sum_budget(q4m)
        total = q1 + q2 + q3 + q4

        actual_rev = (
            db.query(func.sum(Record.revenue_results["revenue"].as_float()))
            .filter(Record.project_id == pid)
            .scalar()
            or 0.0
        )

        display = (p.filename or "").replace(" Tracker.xlsx", "")
        budget_results.append(
            {
                "id": pid,
                "project_id": pid,
                "raw_name": p.account_name or display,
                "system_name": display,
                "is_matched": True,
                "q1": q1,
                "q2": q2,
                "q3": q3,
                "q4": q4,
                "total": total,
                "actual": float(actual_rev),
                "variance": ((float(actual_rev) / total) - 1) * 100 if total > 0 else 0,
            }
        )

    f_q = db.query(FinanceMonthlyLedger).filter(
        FinanceMonthlyLedger.metric_category.in_(PLANNING_FORECAST_CATEGORIES)
    )
    if scoped_project_ids is not None:
        f_q = f_q.filter(FinanceMonthlyLedger.project_id.in_(scoped_project_ids))
    all_fc = f_q.all()

    forecast_map: dict[str, dict[str, Any]] = {}
    for f in all_fc:
        pid = f.project_id
        raw = (f.uploaded_by or "").removeprefix(BF_UPLOADED_BY_PREFIX).strip()
        if not raw or raw.startswith("manual:"):
            p = projects.get(int(pid)) if pid is not None else None
            raw = (p.account_name if p and p.account_name else None) or (
                (p.filename or "").replace(" Tracker.xlsx", "") if p else "Unknown"
            )
        key = f"{raw}|{pid if pid is not None else 'unmatched'}"
        if key not in forecast_map:
            p = projects.get(int(pid)) if pid is not None else None
            sys_name = (p.filename or "").replace(" Tracker.xlsx", "") if p else None
            forecast_map[key] = {
                "raw_name": raw,
                "project_id": pid,
                "is_matched": pid is not None,
                "system_name": sys_name,
                "months": {},
            }
        m_str = f.reporting_month.strftime("%b-%y") if f.reporting_month else ""
        if m_str not in forecast_map[key]["months"]:
            forecast_map[key]["months"][m_str] = {}
        lbl = metric_label_from_category(f.metric_category)
        forecast_map[key]["months"][m_str][lbl] = float(f.forecast_value or 0)

    total_budget = sum(b["total"] for b in budget_results)
    total_actual = sum(b["actual"] for b in budget_results)
    return {
        "summary": {
            "total_budget": total_budget,
            "total_actual": total_actual,
            "variance": ((total_actual / total_budget) - 1) * 100 if total_budget > 0 else 0,
        },
        "budgets": budget_results,
        "forecasts": list(forecast_map.values()),
    }


def waterfall_from_ledger(db: Session, scoped_project_ids: set[int] | None) -> dict[str, float]:
    from sqlalchemy import false, func

    def _ledger_mmf_filter(q):
        q = q.filter(FinanceMonthlyLedger.metric_category == WATERFALL_MMF_CATEGORY)
        if scoped_project_ids is not None:
            if len(scoped_project_ids) == 0:
                return q.filter(false())
            q = q.filter(FinanceMonthlyLedger.project_id.in_(scoped_project_ids))
        return q

    def _record_filter(q):
        if scoped_project_ids is not None:
            if len(scoped_project_ids) == 0:
                return q.filter(false())
            return q.filter(Record.project_id.in_(scoped_project_ids))
        return q

    mmf_min_max = _ledger_mmf_filter(
        db.query(func.min(FinanceMonthlyLedger.reporting_month), func.max(FinanceMonthlyLedger.reporting_month))
    )
    fiscal_start, fiscal_end = mmf_min_max.one()

    if fiscal_start and fiscal_end:
        opening = (
            _ledger_mmf_filter(db.query(func.sum(FinanceMonthlyLedger.forecast_value)))
            .filter(FinanceMonthlyLedger.reporting_month == fiscal_start)
            .scalar()
            or 0.0
        )
        total_forecast = (
            _ledger_mmf_filter(db.query(func.sum(FinanceMonthlyLedger.forecast_value)))
            .filter(
                FinanceMonthlyLedger.reporting_month >= fiscal_start,
                FinanceMonthlyLedger.reporting_month <= fiscal_end,
            )
            .scalar()
            or 0.0
        )
        additions = float(total_forecast) - float(opening)
        return {
            "opening": float(opening),
            "additions": additions,
            "closures": 0.0,
            "leakage": 0.0,
            "total": float(opening) + additions,
        }

    today = dt.datetime.utcnow()
    month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    opening = (
        _ledger_mmf_filter(db.query(func.sum(FinanceMonthlyLedger.forecast_value)))
        .filter(FinanceMonthlyLedger.reporting_month == month_start)
        .scalar()
        or 0.0
    )

    additions = (
        _record_filter(db.query(func.sum(Record.revenue_results["revenue"].as_float())))
        .filter(Record.creation_date >= month_start)
        .scalar()
        or 0.0
    )

    closures = (
        _record_filter(db.query(func.sum(Record.revenue_results["revenue"].as_float())))
        .filter(
            Record.global_status == "CLOSED",
            Record.joining_date >= month_start,
        )
        .scalar()
        or 0.0
    )

    leakage = (
        _record_filter(
            db.query(
                func.sum(
                    Record.revenue_results["opening_fee"].as_float()
                    + Record.revenue_results["closing_fee"].as_float()
                )
            )
        )
        .filter(
            Record.creation_date >= month_start,
            Record.global_status.in_(["ON HOLD", "CANCELLED"]),
        )
        .scalar()
        or 0.0
    )

    return {
        "opening": float(opening),
        "additions": float(additions),
        "closures": float(closures),
        "leakage": float(leakage),
        "total": float(opening) + float(additions) - float(closures) - float(leakage),
    }


def comparison_timeline(db: Session, project_id: int) -> dict[str, Any]:
    f_rows = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.project_id == project_id,
            FinanceMonthlyLedger.metric_category.in_(PLANNING_FORECAST_CATEGORIES),
        )
        .all()
    )
    records = db.query(Record).filter(Record.project_id == project_id).all()

    f_map: dict[str, dict[str, float]] = {}
    for f in f_rows:
        if not f.reporting_month:
            continue
        m_str = f.reporting_month.strftime("%Y-%m")
        if m_str not in f_map:
            f_map[m_str] = {}
        lbl = metric_label_from_category(f.metric_category)
        f_map[m_str][lbl] = float(f.forecast_value or 0)

    a_map: dict[str, dict[str, Any]] = {}
    for r in records:
        if not r.joining_date:
            continue
        m_str = r.joining_date.strftime("%Y-%m")
        if m_str not in a_map:
            a_map[m_str] = {"Joiner": 0, "Joining Fee": 0.0}
        if r.global_status == "CLOSED":
            a_map[m_str]["Joiner"] += 1
            rev = float((r.revenue_results or {}).get("revenue") or 0)
            a_map[m_str]["Joining Fee"] += rev

    all_months = sorted(set(f_map.keys()) | set(a_map.keys()))
    timeline = [
        {
            "month": m,
            "forecast": f_map.get(m, {}),
            "actual": a_map.get(m, {"Joiner": 0, "Joining Fee": 0.0}),
        }
        for m in all_months
    ]
    return {"project_id": project_id, "timeline": timeline}


def migrate_legacy_project_budget_forecast_tables(engine: Any) -> None:
    """One-shot: copy legacy tables into ledger, then DROP legacy tables."""
    from sqlalchemy import inspect

    insp = inspect(engine)
    names = set(insp.get_table_names() or [])
    if "project_budgets" not in names and "project_forecasts" not in names:
        return

    from backend.db.database import SessionLocal

    with SessionLocal() as db:
        if "project_budgets" in names:
            rows = db.execute(
                text(
                    "SELECT project_id, fiscal_year, q1, q2, q3, q4, raw_project_name FROM project_budgets"
                )
            ).mappings().all()
            for r in rows:
                pid = r["project_id"]
                if pid is None:
                    continue
                fy_start = parse_fy_label_to_start_year(str(r["fiscal_year"] or ""))
                apply_quarterly_revenue_budget(
                    db,
                    int(pid),
                    fy_start,
                    float(r["q1"] or 0),
                    float(r["q2"] or 0),
                    float(r["q3"] or 0),
                    float(r["q4"] or 0),
                    source_filename=f"{BF_SOURCE_PREFIX}migrated",
                    uploaded_by=f"{BF_UPLOADED_BY_PREFIX}migrated",
                )

        if "project_forecasts" in names:
            fc_rows = db.execute(
                text(
                    "SELECT project_id, month_year, metric_name, value, raw_project_name FROM project_forecasts"
                )
            ).mappings().all()
            for r in fc_rows:
                pid = r["project_id"]
                my = r["month_year"]
                if isinstance(my, dt.datetime):
                    pass
                elif hasattr(my, "to_pydatetime"):
                    my = my.to_pydatetime()
                else:
                    import pandas as pd

                    try:
                        my = pd.to_datetime(my).to_pydatetime()
                    except Exception:
                        continue
                if not isinstance(my, dt.datetime):
                    continue
                mname = str(r["metric_name"] or "")
                cat = forecast_detail_to_category(mname)
                raw = str(r["raw_project_name"] or "")
                _upsert_ledger_row(
                    db,
                    project_id=int(pid) if pid is not None else None,
                    reporting_month=my,
                    metric_category=cat,
                    forecast_value=float(r["value"] or 0),
                    source_filename=f"{BF_SOURCE_PREFIX}migrated",
                    uploaded_by=f"{BF_UPLOADED_BY_PREFIX}{raw}",
                )
        db.commit()
        dedupe_finance_tables(db)
        db.commit()

    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS project_forecasts"))
        conn.execute(text("DROP TABLE IF EXISTS project_budgets"))
