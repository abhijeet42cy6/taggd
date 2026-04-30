"""Curated client portal dashboard — scoped aggregates + per-client layout config."""
from __future__ import annotations

import copy
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from starlette.responses import JSONResponse

from backend.auth.deps import get_current_user
from backend.auth.profile import (
    ROLE_CLIENT_USER,
    ROLE_PLATFORM_ADMIN,
    effective_role,
    resolve_user_profile,
)
from backend.auth.scope import apply_project_scope, assert_client_access
from backend.auth.verticals import require_vertical
from backend.db.database import (
    Client,
    ClientDashboardConfig,
    FinanceCashFlow,
    FinanceMonthlyLedger,
    MetricDefinition,
    Project,
    Record,
    SLAPerformance,
    User,
    get_db,
)

router = APIRouter(
    prefix="/client-dashboard",
    tags=["client-dashboard"],
    dependencies=[Depends(require_vertical("client_dashboard"))],
)

DEFAULT_CLIENT_DASHBOARD_CONFIG: dict[str, Any] = {
    "version": 1,
    "widgets": {
        "kpi_row": True,
        "sla_summary": True,
        "sla_metrics_table": True,
        "finance_summary": True,
        "projects_table": True,
    },
    "sla_show_internal_kpis": False,
    "finance_show_revenue": True,
    "finance_show_collections": True,
    "finance_show_unbilled": True,
    "finance_show_cm": False,
    "project_vertical_filter": [],
    "project_region_filter": [],
}


def _deep_merge_config(stored: Optional[dict[str, Any]]) -> dict[str, Any]:
    base = copy.deepcopy(DEFAULT_CLIENT_DASHBOARD_CONFIG)
    if not stored or not isinstance(stored, dict):
        return base
    out = {**base, **{k: v for k, v in stored.items() if k != "widgets"}}
    bw = base.get("widgets") if isinstance(base.get("widgets"), dict) else {}
    sw = stored.get("widgets") if isinstance(stored.get("widgets"), dict) else {}
    out["widgets"] = {**bw, **sw}
    return out


def _editor_roles_ok(user: User, db: Session) -> bool:
    er = effective_role(user)
    if er == ROLE_PLATFORM_ADMIN:
        return True
    if er in ("project_head", "executive", "operations"):
        return True
    raw = (user.role or "").strip().lower()
    if raw in ("admin", "manager"):
        return True
    return False


def _scoped_projects(db: Session, user: User, client_id: Optional[int]) -> list[Project]:
    q = apply_project_scope(
        db.query(Project).options(joinedload(Project.client)),
        user,
        db,
        Project,
    )
    if client_id is not None:
        assert_client_access(user, db, client_id)
        q = q.filter(Project.client_id == client_id)
    return q.order_by(Project.account_name.asc().nullslast(), Project.id.asc()).all()


def _filter_projects_with_config(projects: list[Project], merged: dict[str, Any]) -> list[Project]:
    out = list(projects)
    vf = merged.get("project_vertical_filter")
    if isinstance(vf, list) and len(vf) > 0:
        allow_v = {str(x).strip().lower() for x in vf if str(x).strip()}
        out = [p for p in out if (p.vertical or "").strip().lower() in allow_v]
    rf = merged.get("project_region_filter")
    if isinstance(rf, list) and len(rf) > 0:
        allow_r = {str(x).strip().lower() for x in rf if str(x).strip()}
        out = [p for p in out if (p.region or "").strip().lower() in allow_r]
    return out


def _finance_snapshot(db: Session, project_ids: list[int]) -> dict[str, Any]:
    import datetime

    if not project_ids:
        return {
            "revenue_actual": 0.0,
            "revenue_budget": 0.0,
            "rev_attainment": 0.0,
            "total_cm": 0.0,
            "total_unbilled": 0.0,
            "total_collected": 0.0,
            "total_bad_debt": 0.0,
            "total_collection_target": 0.0,
            "collection_pending": 0.0,
            "collection_efficiency": 0.0,
        }

    pid_set = project_ids

    rev_sub = (
        db.query(
            func.max(FinanceMonthlyLedger.actual_value).label("ma"),
            func.max(FinanceMonthlyLedger.budget_value).label("mb"),
        )
        .filter(
            FinanceMonthlyLedger.project_id.in_(pid_set),
            FinanceMonthlyLedger.metric_category == "Revenue",
        )
        .group_by(FinanceMonthlyLedger.project_id, FinanceMonthlyLedger.reporting_month)
    ).subquery()
    total_rev_actual = db.query(func.coalesce(func.sum(rev_sub.c.ma), 0)).scalar() or 0
    total_rev_budget = db.query(func.coalesce(func.sum(rev_sub.c.mb), 0)).scalar() or 0

    cm_sub = (
        db.query(func.max(FinanceMonthlyLedger.actual_value).label("ma"))
        .filter(
            FinanceMonthlyLedger.project_id.in_(pid_set),
            FinanceMonthlyLedger.metric_category == "Contribution Margin",
        )
        .group_by(FinanceMonthlyLedger.project_id, FinanceMonthlyLedger.reporting_month)
    ).subquery()
    total_cm_actual = db.query(func.coalesce(func.sum(cm_sub.c.ma), 0)).scalar() or 0

    cf_sub = (
        db.query(
            func.max(FinanceCashFlow.actual_collected).label("mc"),
            func.max(FinanceCashFlow.bad_debt).label("mbd"),
            func.max(FinanceCashFlow.collection_target).label("mt"),
        )
        .filter(FinanceCashFlow.project_id.in_(pid_set))
        .group_by(FinanceCashFlow.project_id, FinanceCashFlow.reporting_month)
    ).subquery()
    total_collected = db.query(func.coalesce(func.sum(cf_sub.c.mc), 0)).scalar() or 0
    total_bad_debt = db.query(func.coalesce(func.sum(cf_sub.c.mbd), 0)).scalar() or 0
    total_collection_target = db.query(func.coalesce(func.sum(cf_sub.c.mt), 0)).scalar() or 0

    _cash_u: dict = {}
    for _r in db.query(FinanceCashFlow).filter(FinanceCashFlow.project_id.in_(pid_set)).all():
        _k = (_r.project_id, _r.reporting_month)
        _u = float(_r.unbilled_amount or 0.0)
        if _k not in _cash_u:
            _cash_u[_k] = _u
        else:
            _cash_u[_k] = max(_cash_u[_k], _u)
    _by_p: dict = {}
    for (_pid, _m), _u in _cash_u.items():
        _by_p.setdefault(_pid, []).append((_m, _u))
    total_unbilled = 0.0
    for _lst in _by_p.values():
        _lst.sort(key=lambda t: t[0] or datetime.datetime.min, reverse=True)
        total_unbilled += float(_lst[0][1])
    collection_pending = total_collection_target - total_collected

    return {
        "revenue_actual": round(float(total_rev_actual), 2),
        "revenue_budget": round(float(total_rev_budget), 2),
        "rev_attainment": round((total_rev_actual / total_rev_budget * 100), 1) if total_rev_budget > 0 else 0.0,
        "total_cm": round(float(total_cm_actual), 2),
        "total_unbilled": round(float(total_unbilled), 2),
        "total_collected": round(float(total_collected), 2),
        "total_bad_debt": round(float(total_bad_debt), 2),
        "total_collection_target": round(float(total_collection_target), 2),
        "collection_pending": round(float(collection_pending), 2),
        "collection_efficiency": round((total_collected / (total_collected + total_unbilled) * 100), 1)
        if (total_collected + total_unbilled) > 0
        else 0.0,
    }


def _sla_snapshot(db: Session, project_ids: list[int]) -> dict[str, Any]:
    if not project_ids:
        return {
            "portfolio_health": 0.0,
            "met_count": 0,
            "not_met_count": 0,
            "not_reported_count": 0,
            "total_metrics": 0,
        }

    pid_set = project_ids
    total_metrics = db.query(func.count(MetricDefinition.id)).filter(MetricDefinition.project_id.in_(pid_set)).scalar() or 0

    rag_rows = (
        db.query(SLAPerformance.rag_status, func.count(SLAPerformance.id))
        .join(MetricDefinition, MetricDefinition.id == SLAPerformance.definition_id)
        .filter(MetricDefinition.project_id.in_(pid_set))
        .group_by(SLAPerformance.rag_status)
        .all()
    )
    met_count = 0
    not_met_count = 0
    not_reported_count = 0
    for rag, cnt in rag_rows:
        s = (rag or "").strip().lower()
        if s == "met":
            met_count += cnt
        elif "not met" in s or s == "not met":
            not_met_count += cnt
        else:
            not_reported_count += cnt
    denom = met_count + not_met_count
    portfolio_health = round((met_count / denom * 100), 1) if denom > 0 else 0.0

    return {
        "portfolio_health": portfolio_health,
        "met_count": met_count,
        "not_met_count": not_met_count,
        "not_reported_count": not_reported_count,
        "total_metrics": int(total_metrics or 0),
    }


def _sla_metric_rows(db: Session, user: User, project_ids: list[int]) -> list[dict[str, Any]]:
    if not project_ids:
        return []

    metrics = (
        apply_project_scope(
            db.query(MetricDefinition)
            .options(joinedload(MetricDefinition.project))
            .filter(MetricDefinition.project_id.in_(project_ids)),
            user,
            db,
            MetricDefinition,
        ).all()
    )
    def_ids = [m.id for m in metrics]
    all_perfs = (
        db.query(SLAPerformance).filter(SLAPerformance.definition_id.in_(def_ids)).all() if def_ids else []
    )
    perf_map: dict[int, SLAPerformance] = {}
    for p in all_perfs:
        cur = perf_map.get(p.definition_id)
        if cur is None:
            perf_map[p.definition_id] = p
            continue
        if p.period_start is not None and cur.period_start is not None:
            if p.period_start > cur.period_start:
                perf_map[p.definition_id] = p
        elif p.period_start is not None and cur.period_start is None:
            perf_map[p.definition_id] = p
        elif p.period_start is None and cur.period_start is None and p.id > cur.id:
            perf_map[p.definition_id] = p

    rows = []
    for m in metrics:
        latest = perf_map.get(m.id)
        project = m.project
        ph = (project.practice_head or "").strip() if project else ""
        mn = (m.metric_nature or "").strip() if m.metric_nature else ""
        rows.append(
            {
                "id": m.id,
                "project_id": m.project_id,
                "account_name": project.account_name if project else "Unknown",
                "region": project.region if project else "Unknown",
                "practice_head": ph or None,
                "metric_nature": mn or None,
                "metric_label": m.metric_label,
                "metric_group": m.metric_group,
                "target": m.target_threshold,
                "latest_score": latest.score if latest else "N/A",
                "status": latest.rag_status if latest else "N/A",
                "reporting_month": str(latest.reporting_month) if latest and latest.reporting_month else "N/A",
            }
        )
    rows.sort(key=lambda r: (r["account_name"], r["metric_label"]))
    return rows


@router.get("/summary")
async def client_dashboard_summary(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregated SLA + finance + project roster for scoped engagements."""
    projects_all = _scoped_projects(db, user, client_id)

    client_rows: list[dict[str, Any]] = []
    seen_c: set[int] = set()
    for p in projects_all:
        cid = p.client_id
        if cid is None or cid in seen_c:
            continue
        seen_c.add(cid)
        c = p.client
        name = c.official_name if c else "Unknown client"
        client_rows.append({"id": cid, "official_name": name})
    client_rows.sort(key=lambda x: x["official_name"])

    cfg_row: Optional[ClientDashboardConfig] = None
    if client_id is not None:
        cfg_row = db.query(ClientDashboardConfig).filter(ClientDashboardConfig.client_id == client_id).first()
    elif len(client_rows) == 1:
        only_id = client_rows[0]["id"]
        cfg_row = db.query(ClientDashboardConfig).filter(ClientDashboardConfig.client_id == only_id).first()

    merged = _deep_merge_config(cfg_row.config_json if cfg_row else None)

    vertical_options = sorted(
        {(p.vertical or "").strip() for p in projects_all if (p.vertical or "").strip()},
        key=lambda s: s.lower(),
    )
    region_options = sorted(
        {(p.region or "").strip() for p in projects_all if (p.region or "").strip()},
        key=lambda s: s.lower(),
    )

    projects = _filter_projects_with_config(projects_all, merged)
    project_ids = [p.id for p in projects]

    profile = resolve_user_profile(user, db)
    is_client_user = profile.is_client_user

    sla = _sla_snapshot(db, project_ids)
    finance_full = _finance_snapshot(db, project_ids)

    sla_metrics = _sla_metric_rows(db, user, project_ids)
    if not merged.get("sla_show_internal_kpis"):
        def _is_contractual(row: dict[str, Any]) -> bool:
            n = (row.get("metric_nature") or "").lower()
            return "contract" in n

        sla_metrics = [r for r in sla_metrics if _is_contractual(r) or not (r.get("metric_nature") or "").strip()]

    finance_out = dict(finance_full)
    if is_client_user or not merged.get("finance_show_cm"):
        finance_out.pop("total_cm", None)
        finance_out.pop("total_bad_debt", None)
    if is_client_user:
        finance_out.pop("collection_efficiency", None)

    widgets = merged.get("widgets") if isinstance(merged.get("widgets"), dict) else {}
    if not widgets.get("sla_metrics_table", True):
        sla_metrics = []
    if not widgets.get("sla_summary", True):
        sla = {
            "portfolio_health": None,
            "met_count": None,
            "not_met_count": None,
            "not_reported_count": None,
            "total_metrics": None,
        }
    if not widgets.get("finance_summary", True):
        finance_out = {}

    fin_flags = merged if not is_client_user else {**merged, "finance_show_cm": False}
    if not fin_flags.get("finance_show_revenue"):
        finance_out.pop("revenue_actual", None)
        finance_out.pop("revenue_budget", None)
        finance_out.pop("rev_attainment", None)
    if not fin_flags.get("finance_show_collections"):
        finance_out.pop("total_collected", None)
        finance_out.pop("total_collection_target", None)
        finance_out.pop("collection_pending", None)
    if not fin_flags.get("finance_show_unbilled"):
        finance_out.pop("total_unbilled", None)

    requisitions_total = 0
    if project_ids:
        requisitions_total = (
            db.query(func.count(Record.id)).filter(Record.project_id.in_(project_ids)).scalar() or 0
        )

    project_payload = [
        {
            "id": p.id,
            "client_id": p.client_id,
            "account_name": p.account_name or "—",
            "engagement_name": p.engagement_name or "—",
            "region": p.region or "—",
            "practice_head": (p.practice_head or "").strip() or "—",
            "vertical": p.vertical or "—",
        }
        for p in projects
    ]

    selected_client_id = client_id
    if selected_client_id is None and len(client_rows) == 1:
        selected_client_id = client_rows[0]["id"]

    out = {
        "clients": client_rows,
        "selected_client_id": selected_client_id,
        "projects": project_payload if widgets.get("projects_table", True) else [],
        "vertical_options": vertical_options,
        "region_options": region_options,
        "config": merged,
        "sla": sla,
        "sla_metrics": sla_metrics,
        "finance": finance_out,
        "requisitions_total": int(requisitions_total),
        "is_client_user": is_client_user,
        "can_edit_config": _editor_roles_ok(user, db) and not is_client_user,
    }

    return JSONResponse(
        content=out,
        headers={"Cache-Control": "private, max-age=30, stale-while-revalidate=60"},
    )


@router.get("/config")
async def get_client_dashboard_config(
    client_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_client_access(user, db, client_id)
    row = db.query(ClientDashboardConfig).filter(ClientDashboardConfig.client_id == client_id).first()
    return {"client_id": client_id, "config": _deep_merge_config(row.config_json if row else None)}


class ClientDashboardConfigPut(BaseModel):
    client_id: int = Field(..., ge=1)
    config: dict[str, Any]


@router.put("/config")
async def put_client_dashboard_config(
    body: ClientDashboardConfigPut,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _editor_roles_ok(user, db) or effective_role(user) == ROLE_CLIENT_USER:
        raise HTTPException(status_code=403, detail="Insufficient permissions to edit client dashboards")

    assert_client_access(user, db, body.client_id)

    c = db.query(Client).filter(Client.id == body.client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")

    merged = _deep_merge_config(body.config if isinstance(body.config, dict) else None)

    row = db.query(ClientDashboardConfig).filter(ClientDashboardConfig.client_id == body.client_id).first()
    if row is None:
        row = ClientDashboardConfig(client_id=body.client_id, config_json=merged, updated_by_user_id=user.id)
        db.add(row)
    else:
        row.config_json = merged
        row.updated_by_user_id = user.id
    db.commit()
    db.refresh(row)

    return {"client_id": body.client_id, "config": _deep_merge_config(row.config_json)}
