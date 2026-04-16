"""
Analysis Agent — Tool Layer
All tools are parameterized read-only DB queries.
Every tool returns:
  { "data": ..., "meta": { "query_scope": str, "row_count": int, "truncated": bool } }
"""

from __future__ import annotations
import json
import re
import datetime
from datetime import date
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import func, false, or_

# DB models imported via backend package
from backend.db.database import (
    Project,
    Record,
    User,
    MetricDefinition,
    SLAPerformance,
    WFMHRBenchmark,
    WFMResourceGap,
    FinanceMonthlyLedger,
    FinanceCashFlow,
    FinanceEfficiencyKPI,
)
from backend.auth.deps import allowed_project_ids
from backend.auth.profile import (
    ROLE_RECRUITER,
    UserAccessProfile,
    effective_role,
    profile_may_access_vertical,
    resolve_user_profile,
)
from backend.auth.scope import (
    apply_project_scope,
    apply_recruiter_record_scope,
    assert_project_access,
)

_MAX_ROWS = 20   # default cap for detail lists
_SAMPLE   = 5    # sample rows returned alongside aggregates


def _parse_yyyy_mm(s: str) -> tuple[int, int] | None:
    """Canonical SLA month id from ingest (YYYY-MM)."""
    s = (s or "").strip()
    if re.match(r"^\d{4}-\d{2}$", s):
        return int(s[:4]), int(s[6:8])
    return None


def _meta(scope: str, row_count: int, truncated: bool = False) -> dict:
    return {"query_scope": scope, "row_count": row_count, "truncated": truncated}


def _profile(db: Session, user: User) -> UserAccessProfile:
    return resolve_user_profile(user, db)


def _vertical_gate(profile: UserAccessProfile, vertical_key: str) -> str | None:
    if not profile_may_access_vertical(profile, vertical_key):
        return (
            f"Your administrator has not enabled the '{vertical_key}' module for your account "
            "(Users & access → vertical access)."
        )
    return None


def _any_project_intel_module(profile: UserAccessProfile) -> bool:
    """Project-level discovery / summary needs at least one relevant module."""
    for k in ("clients", "requisitions", "portfolio", "sla", "wfm", "finance"):
        if profile_may_access_vertical(profile, k):
            return True
    return False


def _scoped_project_ids(user: User, db: Session) -> set[int] | None:
    """None = org-wide (admin / unrestricted executive); set = restrict to these ids."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return None
    return set(ids)


def _ser(obj: Any) -> Any:
    """JSON-safe serializer for SQLAlchemy row dicts."""
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    if isinstance(obj, datetime.date):
        return obj.isoformat()
    return str(obj)


def _row_to_dict(row: Any) -> dict:
    """Convert a SQLAlchemy model instance to a plain dict."""
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, (datetime.datetime, datetime.date)):
            d[col.name] = val.isoformat() if val else None
        else:
            d[col.name] = val
    return d


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 1 — resolve_client
# ─────────────────────────────────────────────────────────────────────────────
def _project_brief_dict(p: Project) -> dict:
    return {
        "project_id": p.id,
        "account_name": p.account_name,
        "charge_code": p.charge_code,
        "account_status": p.account_status,
        "filename": p.filename,
        "region": p.region,
        "sub_region": p.sub_region,
        "vertical": p.vertical,
        "practice": p.practice,
        "function_head": p.function_head,
        "regional_head": p.regional_head,
        "practice_head": p.practice_head,
        "project_head": p.project_head,
        "be_spoc": p.be_spoc,
        "category": p.category,
        "ingested_at": _ser(p.system_created_at),
    }


def resolve_client(db: Session, user: User, name: str) -> dict:
    """
    Find projects matching the given client/account name.
    Returns project metadata including charge code, heads, region, category.
    """
    profile = _profile(db, user)
    if not _any_project_intel_module(profile):
        return {
            "data": [],
            "meta": _meta("resolve_client (no modules)", 0),
            "error": "No data modules are enabled for your account — ask an administrator to grant at least one of: clients, requisitions, portfolio, SLA, WFM, or finance.",
        }

    q = db.query(Project).filter(Project.account_name.isnot(None))
    q = apply_project_scope(q, user, db, Project)

    # Exact match first
    exact = q.filter(func.lower(Project.account_name) == name.lower().strip()).all()
    if exact:
        rows = exact
        scope = f"exact match on account_name='{name}'"
    else:
        # Fuzzy LIKE fallback
        pat = f"%{name.strip()}%"
        rows = q.filter(Project.account_name.ilike(pat)).all()
        scope = f"ILIKE match on account_name LIKE '%{name}%'"

    data = [_project_brief_dict(p) for p in rows]
    return {"data": data, "meta": _meta(scope, len(data))}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 2 — get_project_summary
# ─────────────────────────────────────────────────────────────────────────────
def get_project_summary(db: Session, user: User, project_id: int) -> dict:
    """
    Returns project metadata, record KPIs, and logic explanation.
    """
    profile = _profile(db, user)
    if not _any_project_intel_module(profile):
        return {
            "data": None,
            "meta": _meta("get_project_summary (no modules)", 0),
            "error": "No data modules are enabled for your account.",
        }
    assert_project_access(user, db, project_id)

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return {"data": None, "meta": _meta(f"project_id={project_id}", 0)}

    # Record aggregates
    status_counts: list = (
        db.query(Record.global_status, func.count(Record.id))
        .filter(Record.project_id == project_id)
        .group_by(Record.global_status)
        .all()
    )
    total_records = sum(c for _, c in status_counts)
    revenue_sum = (
        db.query(func.sum(func.json_extract(Record.revenue_results, "$.revenue")))
        .filter(Record.project_id == project_id)
        .scalar() or 0.0
    )

    # Date range
    date_range = (
        db.query(func.min(Record.creation_date), func.max(Record.creation_date))
        .filter(Record.project_id == project_id)
        .first()
    )

    data = {
        "project_id": project.id,
        "account_name": project.account_name,
        "charge_code": project.charge_code,
        "account_status": project.account_status,
        "filename": project.filename,
        "region": project.region,
        "sub_region": project.sub_region,
        "vertical": project.vertical,
        "practice": project.practice,
        "function_head": project.function_head,
        "regional_head": project.regional_head,
        "practice_head": project.practice_head,
        "project_head": project.project_head,
        "be_spoc": project.be_spoc,
        "category": project.category,
        "logic_explanation": project.logic_explanation,
        "pos_id_column": project.pos_id_column,
        "record_stats": {
            "total": total_records,
            "by_global_status": {s: c for s, c in status_counts},
            "total_revenue_inr": round(float(revenue_sum), 2),
        },
        "date_range": {
            "earliest": _ser(date_range[0]) if date_range else None,
            "latest": _ser(date_range[1]) if date_range else None,
        },
        "ingested_at": _ser(project.system_created_at),
    }
    return {"data": data, "meta": _meta(f"project_id={project_id}", 1)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 3 — search_records
# ─────────────────────────────────────────────────────────────────────────────
def search_records(
    db: Session,
    user: User,
    project_id: int,
    global_status: str | None = None,
    department: str | None = None,
    location: str | None = None,
    hiring_manager: str | None = None,
    keyword: str | None = None,
    excel_provided_id: str | None = None,
    limit: int = _MAX_ROWS,
    offset: int = 0,
) -> dict:
    """
    Search/filter requisition records for a project with optional filters.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "requisitions"):
        return {"data": [], "meta": _meta("search_records (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    limit = min(limit, 50)  # hard cap
    q = db.query(Record).filter(Record.project_id == project_id)
    if effective_role(user) == ROLE_RECRUITER:
        q = apply_recruiter_record_scope(q, user, db)

    if global_status:
        q = q.filter(func.lower(Record.global_status) == global_status.lower())
    if department:
        q = q.filter(Record.department.ilike(f"%{department}%"))
    if location:
        q = q.filter(Record.location.ilike(f"%{location}%"))
    if hiring_manager:
        q = q.filter(Record.hiring_manager.ilike(f"%{hiring_manager}%"))
    if excel_provided_id:
        q = q.filter(Record.excel_provided_id.ilike(f"%{excel_provided_id}%"))
    if keyword:
        q = q.filter(
            or_(
                Record.candidate_name.ilike(f"%{keyword}%"),
                Record.position_title.ilike(f"%{keyword}%"),
            )
        )

    total = q.count()
    rows = q.order_by(Record.id.desc()).offset(offset).limit(limit).all()

    data = []
    for r in rows:
        data.append({
            "record_id": r.id,
            "excel_provided_id": r.excel_provided_id,
            "candidate_name": r.candidate_name,
            "position_title": r.position_title,
            "global_status": r.global_status,
            "status": r.status,
            "department": r.department,
            "location": r.location,
            "hiring_manager": r.hiring_manager,
            "offered_ctc": r.offered_ctc,
            "creation_date": _ser(r.creation_date),
            "joining_date": _ser(r.joining_date),
            "revenue": (r.revenue_results or {}).get("revenue", 0),
            "opening_fee": (r.revenue_results or {}).get("opening_fee", 0),
            "closing_fee": (r.revenue_results or {}).get("closing_fee", 0),
        })

    filters_applied = {k: v for k, v in {
        "global_status": global_status, "department": department,
        "location": location, "keyword": keyword,
        "excel_provided_id": excel_provided_id,
    }.items() if v}

    return {
        "data": data,
        "meta": _meta(
            f"project_id={project_id}, filters={filters_applied}",
            total,
            truncated=(total > offset + limit),
        ),
        "total_matching": total,
        "showing": f"{offset+1}–{min(offset+limit, total)} of {total}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 4 — get_record_by_id
# ─────────────────────────────────────────────────────────────────────────────
def get_record_by_id(db: Session, user: User, record_id: int) -> dict:
    """
    Fetch a single requisition record by its DB id. Returns all fields.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "requisitions"):
        return {"data": None, "meta": _meta("get_record_by_id (vertical)", 0), "error": err}

    rq = db.query(Record).filter(Record.id == record_id)
    if effective_role(user) == ROLE_RECRUITER:
        rq = apply_recruiter_record_scope(rq, user, db)
    r = rq.first()
    if not r:
        return {"data": None, "meta": _meta(f"record_id={record_id}", 0)}
    assert_project_access(user, db, r.project_id)

    project = db.query(Project.account_name).filter(Project.id == r.project_id).scalar()
    data = {
        "record_id": r.id,
        "project_id": r.project_id,
        "account_name": project,
        "excel_provided_id": r.excel_provided_id,
        "excel_row_index": r.excel_row_index,
        "candidate_name": r.candidate_name,
        "position_title": r.position_title,
        "global_status": r.global_status,
        "status": r.status,
        "req_status": getattr(r, "req_status", None),
        "department": r.department,
        "location": r.location,
        "hiring_manager": r.hiring_manager,
        "offered_ctc": r.offered_ctc,
        "creation_date": _ser(r.creation_date),
        "joining_date": _ser(r.joining_date),
        "revenue_results": r.revenue_results,
        "fingerprint": r.fingerprint,
        "source_filename": r.source_filename,
        "ingested_at": _ser(r.system_created_at),
    }
    return {"data": data, "meta": _meta(f"record_id={record_id}", 1)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 5 — aggregate_records
# ─────────────────────────────────────────────────────────────────────────────
def aggregate_records(db: Session, user: User, project_id: int) -> dict:
    """
    Return aggregated KPIs for a project: status counts, revenue totals,
    ageing buckets, department breakdown, top hiring managers.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "requisitions"):
        return {"data": None, "meta": _meta("aggregate_records (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    def scoped_records() -> Any:
        q = db.query(Record).filter(Record.project_id == project_id)
        if effective_role(user) == ROLE_RECRUITER:
            q = apply_recruiter_record_scope(q, user, db)
        return q

    base = scoped_records()

    # Status breakdown
    status_rows = (
        base.with_entities(Record.global_status, func.count(Record.id))
        .group_by(Record.global_status)
        .all()
    )
    status_map = {s: c for s, c in status_rows}
    total = sum(status_map.values())

    # Revenue
    rev = (
        scoped_records()
        .with_entities(
            func.sum(func.json_extract(Record.revenue_results, "$.revenue")),
            func.sum(func.json_extract(Record.revenue_results, "$.opening_fee")),
            func.sum(func.json_extract(Record.revenue_results, "$.closing_fee")),
        )
        .first()
    )

    # Department breakdown (top 8)
    dept_rows = (
        scoped_records()
        .filter(Record.department.isnot(None))
        .with_entities(Record.department, func.count(Record.id))
        .group_by(Record.department)
        .order_by(func.count(Record.id).desc())
        .limit(8)
        .all()
    )

    # Hiring manager breakdown (top 5)
    hm_rows = (
        scoped_records()
        .filter(Record.hiring_manager.isnot(None))
        .with_entities(Record.hiring_manager, func.count(Record.id))
        .group_by(Record.hiring_manager)
        .order_by(func.count(Record.id).desc())
        .limit(5)
        .all()
    )

    # Ageing buckets (days open = today - creation_date for non-CLOSED)
    today = datetime.datetime.utcnow()
    ageing_data = (
        scoped_records()
        .filter(
            Record.global_status != "CLOSED",
            Record.creation_date.isnot(None),
        )
        .with_entities(Record.creation_date)
        .all()
    )
    buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    for (cd,) in ageing_data:
        if cd:
            days = (today - cd).days
            if days <= 30:
                buckets["0-30"] += 1
            elif days <= 60:
                buckets["31-60"] += 1
            elif days <= 90:
                buckets["61-90"] += 1
            else:
                buckets["90+"] += 1

    # Fill rate
    closed = status_map.get("CLOSED", 0)
    fill_rate = round(closed / total * 100, 1) if total > 0 else 0.0

    data = {
        "project_id": project_id,
        "total_records": total,
        "status_breakdown": status_map,
        "fill_rate_pct": fill_rate,
        "revenue": {
            "total_revenue_inr": round(float(rev[0] or 0), 2),
            "total_opening_fee_inr": round(float(rev[1] or 0), 2),
            "total_closing_fee_inr": round(float(rev[2] or 0), 2),
        },
        "ageing_buckets": buckets,
        "department_breakdown": {d: c for d, c in dept_rows},
        "top_hiring_managers": {hm: c for hm, c in hm_rows},
    }
    return {"data": data, "meta": _meta(f"project_id={project_id} (aggregate)", total)}


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 6 — get_sla_metrics
# ─────────────────────────────────────────────────────────────────────────────
def get_sla_metrics(
    db: Session,
    user: User,
    project_id: int,
    metric_label: str | None = None,
    month_from: str | None = None,
    month_to: str | None = None,
    limit: int = 30,
) -> dict:
    """
    Return SLA metric definitions and their time-series performance for a project.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "sla"):
        return {"data": [], "meta": _meta("get_sla_metrics (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    limit = min(limit, 100)
    # Metric definitions
    defs_q = db.query(MetricDefinition).filter(MetricDefinition.project_id == project_id)
    if metric_label:
        defs_q = defs_q.filter(MetricDefinition.metric_label.ilike(f"%{metric_label}%"))
    defs = defs_q.all()

    def_ids = [d.id for d in defs]
    if not def_ids:
        return {"data": [], "meta": _meta(f"project_id={project_id}", 0)}

    # Performances
    perf_q = db.query(SLAPerformance).filter(SLAPerformance.definition_id.in_(def_ids))
    if month_from:
        t = _parse_yyyy_mm(month_from)
        if t:
            y, m = t
            perf_q = perf_q.filter(SLAPerformance.period_start >= date(y, m, 1))
        else:
            perf_q = perf_q.filter(SLAPerformance.reporting_month >= month_from)
    if month_to:
        t = _parse_yyyy_mm(month_to)
        if t:
            y, m = t
            perf_q = perf_q.filter(SLAPerformance.period_start <= date(y, m, 1))
        else:
            perf_q = perf_q.filter(SLAPerformance.reporting_month <= month_to)

    perfs = perf_q.order_by(
        SLAPerformance.period_start.asc().nullslast(),
        SLAPerformance.definition_id,
        SLAPerformance.reporting_month,
    ).limit(limit).all()
    total_perfs = perf_q.count()

    perf_by_def: dict[int, list] = {}
    for p in perfs:
        perf_by_def.setdefault(p.definition_id, []).append({
            "month": p.reporting_month,
            "period_start": p.period_start.isoformat() if p.period_start else None,
            "score": p.score,
            "rag_status": p.rag_status,
        })

    data = []
    for d in defs:
        data.append({
            "definition_id": d.id,
            "metric_label": d.metric_label,
            "metric_group": d.metric_group,
            "target": d.target_threshold,
            "definition": d.definition,
            "formula": d.formula,
            "performances": perf_by_def.get(d.id, []),
        })

    return {
        "data": data,
        "meta": _meta(
            f"project_id={project_id}, metric_label={metric_label}",
            total_perfs,
            truncated=(total_perfs > limit),
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 7 — get_wfm_snapshot
# ─────────────────────────────────────────────────────────────────────────────
def get_wfm_snapshot(db: Session, user: User, project_id: int) -> dict:
    """
    Return WFM benchmarks and resource gaps for a project.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "wfm"):
        return {"data": None, "meta": _meta("get_wfm_snapshot (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    benchmarks = (
        db.query(WFMHRBenchmark)
        .filter(WFMHRBenchmark.project_id == project_id)
        .all()
    )
    gaps = (
        db.query(WFMResourceGap)
        .filter(WFMResourceGap.project_id == project_id)
        .limit(20)
        .all()
    )
    total_gaps = db.query(func.count(WFMResourceGap.id)).filter(WFMResourceGap.project_id == project_id).scalar() or 0

    bench_data = []
    for b in benchmarks:
        actual = b.actual_hc_total or 0
        ideal = b.ideal_hc or 0
        fill = round(actual / ideal * 100, 1) if ideal > 0 else 0.0
        bench_data.append({
            "id": b.id,
            "reporting_date": _ser(b.reporting_date),
            "ideal_hc": ideal,
            "actual_hc_total": actual,
            "fill_rate_pct": fill,
            "hc_gap": round(ideal - actual, 1),
            "lateral_hc_target": b.lateral_hc_target,
            "lateral_revenue_target": b.lateral_revenue_target,
            "wl1_hires": b.wl1_hires,
            "wl2_hires": b.wl2_hires,
            "wl3_hires": b.wl3_hires,
            "wl4_hires": b.wl4_hires,
        })

    gap_data = [
        {
            "req_id": g.req_id,
            "status": g.status,
            "hiring_type": g.hiring_type,
            "designation_level": g.designation_level,
            "target_date": _ser(g.target_date),
        }
        for g in gaps
    ]

    return {
        "data": {"benchmarks": bench_data, "resource_gaps": gap_data},
        "meta": _meta(f"project_id={project_id}", len(benchmarks) + total_gaps,
                      truncated=(total_gaps > 20)),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 8 — get_finance_ledger
# ─────────────────────────────────────────────────────────────────────────────
def get_finance_ledger(
    db: Session,
    user: User,
    project_id: int,
    metric_category: str | None = None,
    month_from: str | None = None,
    month_to: str | None = None,
) -> dict:
    """
    Return finance monthly ledger rows (budget / actual / forecast) for a project.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "finance"):
        return {"data": None, "meta": _meta("get_finance_ledger (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    q = db.query(FinanceMonthlyLedger).filter(FinanceMonthlyLedger.project_id == project_id)
    if metric_category:
        q = q.filter(FinanceMonthlyLedger.metric_category.ilike(f"%{metric_category}%"))
    if month_from:
        q = q.filter(FinanceMonthlyLedger.reporting_month >= month_from)
    if month_to:
        q = q.filter(FinanceMonthlyLedger.reporting_month <= month_to)

    total = q.count()
    rows = q.order_by(FinanceMonthlyLedger.reporting_month).limit(60).all()

    cashflow = (
        db.query(FinanceCashFlow)
        .filter(FinanceCashFlow.project_id == project_id)
        .order_by(FinanceCashFlow.reporting_month)
        .limit(24)
        .all()
    )

    ledger = [
        {
            "month": _ser(r.reporting_month),
            "category": r.metric_category,
            "budget": r.budget_value,
            "forecast": r.forecast_value,
            "actual": r.actual_value,
            "actual_cost": r.actual_cost,
        }
        for r in rows
    ]
    cf = [
        {
            "month": _ser(r.reporting_month),
            "unbilled": r.unbilled_amount,
            "collection_target": r.collection_target,
            "actual_collected": r.actual_collected,
            "bad_debt": r.bad_debt,
        }
        for r in cashflow
    ]

    return {
        "data": {"ledger": ledger, "cashflow": cf},
        "meta": _meta(f"project_id={project_id}, category={metric_category}", total,
                      truncated=(total > 60)),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 9 — get_budget_forecast
# ─────────────────────────────────────────────────────────────────────────────
def get_budget_forecast(db: Session, user: User, project_id: int) -> dict:
    """
    Return project-level budgets (quarterly Revenue ledger) and planning forecast lines
    (`Revenue_MMF`, `Forecast_Joiners`, etc.) from `finance_monthly_ledger`.
    """
    profile = _profile(db, user)
    if err := _vertical_gate(profile, "finance"):
        return {"data": None, "meta": _meta("get_budget_forecast (vertical)", 0), "error": err}
    assert_project_access(user, db, project_id)

    from backend.core.finance_planning_categories import PLANNING_FORECAST_CATEGORIES

    rev_rows = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.project_id == project_id,
            FinanceMonthlyLedger.metric_category == "Revenue",
        )
        .order_by(FinanceMonthlyLedger.reporting_month.asc())
        .all()
    )
    fc_rows = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.project_id == project_id,
            FinanceMonthlyLedger.metric_category.in_(PLANNING_FORECAST_CATEGORIES),
        )
        .order_by(FinanceMonthlyLedger.reporting_month.asc(), FinanceMonthlyLedger.metric_category.asc())
        .limit(120)
        .all()
    )
    total_fc = (
        db.query(func.count(FinanceMonthlyLedger.id))
        .filter(
            FinanceMonthlyLedger.project_id == project_id,
            FinanceMonthlyLedger.metric_category.in_(PLANNING_FORECAST_CATEGORIES),
        )
        .scalar()
        or 0
    )

    bdata = [
        {
            "reporting_month": _ser(r.reporting_month),
            "metric_category": r.metric_category,
            "budget_value": r.budget_value,
            "forecast_value": r.forecast_value,
            "actual_value": r.actual_value,
        }
        for r in rev_rows
    ]
    fdata = [
        {
            "month": _ser(f.reporting_month),
            "metric_category": f.metric_category,
            "forecast_value": f.forecast_value,
        }
        for f in fc_rows
    ]

    return {
        "data": {"budgets": bdata, "forecasts": fdata},
        "meta": _meta(
            f"project_id={project_id} ledger",
            len(rev_rows) + len(fc_rows),
            truncated=(total_fc > 120),
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# TOOL 10 — portfolio_overview
# ─────────────────────────────────────────────────────────────────────────────
def portfolio_overview(db: Session, user: User) -> dict:
    """
    Return a portfolio-wide snapshot scoped to the user's assigned projects
    and to vertical modules enabled by an administrator.
    """
    profile = _profile(db, user)
    ids = _scoped_project_ids(user, db)

    if not _any_project_intel_module(profile):
        return {
            "data": None,
            "meta": _meta("portfolio (no modules)", 0),
            "error": "No data modules are enabled for your account.",
        }

    if ids is not None and len(ids) == 0:
        return {
            "data": {
                "projects": {"total_projects": 0, "unique_accounts": 0},
                "requisitions": None,
                "revenue": None,
                "sla": None,
                "wfm": None,
                "scope_notes": ["No project assignments — an administrator must assign projects to your user."],
            },
            "meta": _meta("portfolio-empty-assignments", 0),
        }

    notes: list[str] = []
    data: dict[str, Any] = {}

    if profile_may_access_vertical(profile, "clients") or profile_may_access_vertical(profile, "portfolio"):
        pq = db.query(Project)
        if ids is not None:
            pq = pq.filter(Project.id.in_(ids))
        total_projects = pq.with_entities(func.count(Project.id)).scalar() or 0
        total_accounts = pq.with_entities(func.count(func.distinct(Project.account_name))).scalar() or 0
        data["projects"] = {"total_projects": total_projects, "unique_accounts": total_accounts}
    else:
        data["projects"] = None
        notes.append("Project counts omitted — enable Clients or Portfolio in Users & access.")

    if profile_may_access_vertical(profile, "requisitions"):
        rq = db.query(Record)
        if ids is not None:
            rq = rq.filter(Record.project_id.in_(ids))
        if effective_role(user) == ROLE_RECRUITER:
            rq = apply_recruiter_record_scope(rq, user, db)

        status_rows = rq.with_entities(Record.global_status, func.count(Record.id)).group_by(Record.global_status).all()
        status_map = {s: c for s, c in status_rows}
        total_records = sum(status_map.values())
        revenue_total = rq.with_entities(func.sum(func.json_extract(Record.revenue_results, "$.revenue"))).scalar() or 0.0

        top_q = (
            db.query(
                Project.account_name,
                func.sum(func.json_extract(Record.revenue_results, "$.revenue")).label("rev"),
                func.count(Record.id).label("reqs"),
            )
            .select_from(Record)
            .join(Project, Record.project_id == Project.id)
        )
        if ids is not None:
            top_q = top_q.filter(Record.project_id.in_(ids))
        if effective_role(user) == ROLE_RECRUITER:
            top_q = apply_recruiter_record_scope(top_q, user, db)
        top_clients = (
            top_q.group_by(Project.account_name)
            .order_by(func.sum(func.json_extract(Record.revenue_results, "$.revenue")).desc())
            .limit(8)
            .all()
        )

        data["requisitions"] = {
            "total": total_records,
            "by_global_status": status_map,
            "fill_rate_pct": round(status_map.get("CLOSED", 0) / total_records * 100, 1) if total_records > 0 else 0.0,
        }
        data["revenue"] = {
            "total_revenue_inr": round(float(revenue_total), 2),
            "top_clients_by_revenue": [
                {"account": r[0], "revenue_inr": round(float(r[1] or 0), 2), "total_reqs": r[2]}
                for r in top_clients
            ],
        }
    else:
        data["requisitions"] = None
        data["revenue"] = None
        notes.append("Requisition and revenue rollups omitted — enable Requisitions in Users & access.")

    if profile_may_access_vertical(profile, "sla"):
        sla_q = (
            db.query(SLAPerformance.rag_status, func.count(SLAPerformance.id))
            .join(MetricDefinition, SLAPerformance.definition_id == MetricDefinition.id)
        )
        if ids is not None:
            sla_q = sla_q.filter(MetricDefinition.project_id.in_(ids))
        sla_rag = sla_q.group_by(SLAPerformance.rag_status).all()
        sla_map = {s: c for s, c in sla_rag}
        data["sla"] = {
            "rag_distribution": sla_map,
            "met_count": sla_map.get("Met", 0),
            "not_met_count": sla_map.get("Not Met", 0) + sla_map.get("NOT MET", 0),
        }
    else:
        data["sla"] = None
        notes.append("SLA summary omitted — enable SLA in Users & access.")

    if profile_may_access_vertical(profile, "wfm"):
        wq = db.query(func.sum(WFMHRBenchmark.ideal_hc), func.sum(WFMHRBenchmark.actual_hc_total))
        if ids is not None:
            wq = wq.filter(WFMHRBenchmark.project_id.in_(ids))
        wfm_agg = wq.first()
        data["wfm"] = {
            "total_ideal_hc": float(wfm_agg[0] or 0),
            "total_actual_hc": float(wfm_agg[1] or 0),
        }
    else:
        data["wfm"] = None
        notes.append("WFM summary omitted — enable WFM in Users & access.")

    if notes:
        data["scope_notes"] = notes

    row_hint = (data.get("requisitions") or {}).get("total") if isinstance(data.get("requisitions"), dict) else 0
    return {"data": data, "meta": _meta("portfolio-scoped", int(row_hint or 0))}


# ─────────────────────────────────────────────────────────────────────────────
# DISPATCH — called by the agent orchestrator
# ─────────────────────────────────────────────────────────────────────────────
TOOL_REGISTRY: dict[str, Any] = {
    "resolve_client": resolve_client,
    "get_project_summary": get_project_summary,
    "search_records": search_records,
    "get_record_by_id": get_record_by_id,
    "aggregate_records": aggregate_records,
    "get_sla_metrics": get_sla_metrics,
    "get_wfm_snapshot": get_wfm_snapshot,
    "get_finance_ledger": get_finance_ledger,
    "get_budget_forecast": get_budget_forecast,
    "portfolio_overview": portfolio_overview,
}


def execute_tool(name: str, args: dict, db: Session, user: User) -> dict:
    """
    Dispatch a tool call by name. Passes authenticated user for project + module scoping.
    Returns a JSON-safe result dict.
    """
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}", "data": None, "meta": {}}
    try:
        return fn(db, user, **args)
    except Exception as exc:
        return {"error": str(exc), "data": None, "meta": {"query_scope": name}}
