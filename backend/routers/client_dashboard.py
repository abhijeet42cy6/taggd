"""Curated client portal dashboard — scoped aggregates + per-client layout config (v2)."""
from __future__ import annotations

import copy
import uuid
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

# ─── Block catalog ─────────────────────────────────────────────────────────────

BLOCK_CATALOG: list[dict[str, str]] = [
    {
        "type": "sla_kpi_strip",
        "label": "SLA KPI strip",
        "desc": "Hero metrics: SLA met %, total tracked, portfolio health",
        "category": "SLA",
    },
    {
        "type": "sla_summary_cards",
        "label": "SLA summary cards",
        "desc": "Cards showing met / not-met / not-reported counts",
        "category": "SLA",
    },
    {
        "type": "sla_table",
        "label": "SLA KPI table",
        "desc": "Detailed contractual KPI rows with score, target, status",
        "category": "SLA",
    },
    {
        "type": "req_kpi",
        "label": "Requisitions KPI",
        "desc": "Total requisition count for allocated projects",
        "category": "Requisitions",
    },
    {
        "type": "engagements_table",
        "label": "Engagements table",
        "desc": "Roster of allocated project engagements",
        "category": "Engagements",
    },
    {
        "type": "finance_strip",
        "label": "Finance snapshot",
        "desc": "Revenue, collections, unbilled tiles (visibility controlled per flag)",
        "category": "Finance",
    },
]

ALLOWED_BLOCK_TYPES = {b["type"] for b in BLOCK_CATALOG}

DEFAULT_LAYOUT: list[dict[str, Any]] = [
    {"id": "sla_kpi_strip", "type": "sla_kpi_strip", "variant": "card", "order": 0},
    {"id": "sla_summary_cards", "type": "sla_summary_cards", "variant": "card", "order": 1},
    {"id": "sla_table", "type": "sla_table", "variant": "card", "order": 2},
    {"id": "req_kpi", "type": "req_kpi", "variant": "dense", "order": 3},
    {"id": "engagements_table", "type": "engagements_table", "variant": "card", "order": 4},
]

DEFAULT_CLIENT_DASHBOARD_CONFIG: dict[str, Any] = {
    "version": 2,
    "layout": DEFAULT_LAYOUT,
    "sla_show_internal_kpis": False,
    "finance_show_revenue": True,
    "finance_show_collections": True,
    "finance_show_unbilled": True,
    "finance_show_cm": False,
    "project_vertical_filter": [],
    "project_region_filter": [],
}


# ─── Config helpers ─────────────────────────────────────────────────────────────

def _widgets_to_layout(widgets: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert v1 widget flags to v2 layout array."""
    mapping = [
        ("kpi_row", "sla_kpi_strip"),
        ("sla_summary", "sla_summary_cards"),
        ("sla_metrics_table", "sla_table"),
        ("projects_table", "engagements_table"),
        ("finance_summary", "finance_strip"),
    ]
    layout = []
    order = 0
    for old_key, new_type in mapping:
        if widgets.get(old_key, True):
            layout.append({"id": new_type, "type": new_type, "variant": "card", "order": order})
            order += 1
    # Inject req_kpi if not represented
    if not any(b["type"] == "req_kpi" for b in layout):
        layout.append({"id": "req_kpi", "type": "req_kpi", "variant": "dense", "order": order})
    return layout


def _validate_layout(layout: list[Any]) -> list[dict[str, Any]]:
    """Strip unknown block types and ensure required fields."""
    out = []
    for b in layout:
        if not isinstance(b, dict):
            continue
        bt = b.get("type")
        if bt not in ALLOWED_BLOCK_TYPES:
            continue
        out.append({
            "id": str(b.get("id") or bt),
            "type": bt,
            "variant": b.get("variant", "card") if b.get("variant") in ("card", "dense") else "card",
            "order": int(b.get("order", 0)),
            "label": str(b["label"])[:80] if b.get("label") else None,
        })
    return out


def _deep_merge_config(stored: Optional[dict[str, Any]]) -> dict[str, Any]:
    base = copy.deepcopy(DEFAULT_CLIENT_DASHBOARD_CONFIG)
    if not stored or not isinstance(stored, dict):
        return base

    out = dict(base)

    # layout: v2 stored layout wins; v1 widgets converted; else default
    if "layout" in stored and isinstance(stored["layout"], list):
        validated = _validate_layout(stored["layout"])
        out["layout"] = validated if validated else copy.deepcopy(DEFAULT_LAYOUT)
    elif "widgets" in stored and isinstance(stored.get("widgets"), dict):
        out["layout"] = _widgets_to_layout(stored["widgets"])

    # scalar pass-through fields
    for k in (
        "sla_show_internal_kpis",
        "finance_show_revenue",
        "finance_show_collections",
        "finance_show_unbilled",
        "finance_show_cm",
        "project_vertical_filter",
        "project_region_filter",
    ):
        if k in stored:
            out[k] = stored[k]

    out["version"] = 2
    return out


# ─── Auth helpers ───────────────────────────────────────────────────────────────

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


# ─── Data helpers ───────────────────────────────────────────────────────────────

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


def _bu_tabs(projects: list[Project]) -> list[dict[str, Any]]:
    """Group projects by BU/SBU hierarchy tag for horizontal tab navigation.

    Returns [] when no project has a hierarchy tag (no tabs rendered).
    The first entry is always "All" covering every project.
    """
    bu_map: dict[str, list[int]] = {}
    for p in projects:
        tag = (p.hierarchy_tag_bu or p.hierarchy_tag_sbu or "").strip()
        if tag:
            bu_map.setdefault(tag, []).append(p.id)
    if not bu_map:
        return []
    all_ids = [p.id for p in projects]
    tabs: list[dict[str, Any]] = [{"key": "all", "label": "All", "project_ids": all_ids}]
    for tag in sorted(bu_map.keys()):
        tabs.append({"key": tag, "label": tag, "project_ids": bu_map[tag]})
    return tabs


def _finance_snapshot(db: Session, project_ids: list[int]) -> dict[str, Any]:
    import datetime

    if not project_ids:
        return {
            "revenue_actual": 0.0, "revenue_budget": 0.0, "rev_attainment": 0.0,
            "total_cm": 0.0, "total_unbilled": 0.0, "total_collected": 0.0,
            "total_bad_debt": 0.0, "total_collection_target": 0.0,
            "collection_pending": 0.0, "collection_efficiency": 0.0,
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
        _cash_u[_k] = max(_cash_u.get(_k, 0.0), _u)
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
        if (total_collected + total_unbilled) > 0 else 0.0,
    }


def _sla_metric_rows(db: Session, user: User, project_ids: list[int]) -> list[dict[str, Any]]:
    if not project_ids:
        return []

    metrics = (
        apply_project_scope(
            db.query(MetricDefinition)
            .options(joinedload(MetricDefinition.project))
            .filter(MetricDefinition.project_id.in_(project_ids)),
            user, db, MetricDefinition,
        ).all()
    )
    def_ids = [m.id for m in metrics]
    all_perfs = (
        db.query(SLAPerformance).filter(SLAPerformance.definition_id.in_(def_ids)).all()
        if def_ids else []
    )
    perf_map: dict[int, SLAPerformance] = {}
    for p in all_perfs:
        cur = perf_map.get(p.definition_id)
        if cur is None:
            perf_map[p.definition_id] = p
        elif p.period_start is not None and cur.period_start is not None and p.period_start > cur.period_start:
            perf_map[p.definition_id] = p
        elif p.period_start is not None and cur.period_start is None:
            perf_map[p.definition_id] = p
        elif p.period_start is None and cur.period_start is None and p.id > cur.id:
            perf_map[p.definition_id] = p

    rows = []
    for m in metrics:
        latest = perf_map.get(m.id)
        project = m.project
        rows.append({
            "id": m.id,
            "project_id": m.project_id,
            "account_name": project.account_name if project else "Unknown",
            "region": project.region if project else "Unknown",
            "practice_head": (project.practice_head or "").strip() or None if project else None,
            "metric_nature": (m.metric_nature or "").strip() or None,
            "metric_label": m.metric_label,
            "metric_group": m.metric_group,
            "target": m.target_threshold,
            "latest_score": latest.score if latest else "N/A",
            "status": latest.rag_status if latest else "N/A",
            "reporting_month": str(latest.reporting_month) if latest and latest.reporting_month else "N/A",
        })
    rows.sort(key=lambda r: (r["account_name"], r["metric_label"]))
    return rows


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("/blocks")
async def get_block_catalog(_user: User = Depends(get_current_user)):
    """Block catalog for the layout builder — returns all allowed block types."""
    return {"blocks": BLOCK_CATALOG}


@router.get("/summary")
async def client_dashboard_summary(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregated SLA + finance + project roster with v2 layout config."""
    projects_all = _scoped_projects(db, user, client_id)

    # Collect distinct clients visible to this user
    client_rows: list[dict[str, Any]] = []
    seen_c: set[int] = set()
    for p in projects_all:
        cid = p.client_id
        if cid is None or cid in seen_c:
            continue
        seen_c.add(cid)
        c = p.client
        client_rows.append({"id": cid, "official_name": c.official_name if c else "Unknown client"})
    client_rows.sort(key=lambda x: x["official_name"])

    # ── Phase A fix: always resolve a single client_id for config loading ──
    # For client_users with exactly 1 client, or any request with 1 scoped client,
    # load their config reliably regardless of whether client_id was passed in the URL.
    resolved_client_id: Optional[int] = client_id
    if resolved_client_id is None and len(client_rows) == 1:
        resolved_client_id = client_rows[0]["id"]

    cfg_row: Optional[ClientDashboardConfig] = None
    if resolved_client_id is not None:
        cfg_row = (
            db.query(ClientDashboardConfig)
            .filter(ClientDashboardConfig.client_id == resolved_client_id)
            .first()
        )

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

    finance_full = _finance_snapshot(db, project_ids)

    sla_metrics = _sla_metric_rows(db, user, project_ids)
    if not merged.get("sla_show_internal_kpis"):
        def _is_contractual(row: dict[str, Any]) -> bool:
            return "contract" in (row.get("metric_nature") or "").lower()
        sla_metrics = [r for r in sla_metrics if _is_contractual(r) or not (r.get("metric_nature") or "").strip()]

    # Finance field gating (security — not display)
    finance_out = dict(finance_full)
    if is_client_user or not merged.get("finance_show_cm"):
        finance_out.pop("total_cm", None)
        finance_out.pop("total_bad_debt", None)
    if is_client_user:
        finance_out.pop("collection_efficiency", None)

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

    # Requisitions per project (for tab-level aggregation on the frontend)
    req_by_project: dict[str, int] = {}
    if project_ids:
        rq_rows = (
            db.query(Record.project_id, func.count(Record.id))
            .filter(Record.project_id.in_(project_ids))
            .group_by(Record.project_id)
            .all()
        )
        req_by_project = {str(pid): int(cnt) for pid, cnt in rq_rows}

    # BU/SBU tabs
    bu_tabs = _bu_tabs(projects)

    project_payload = [
        {
            "id": p.id,
            "client_id": p.client_id,
            "account_name": p.account_name or "—",
            "engagement_name": p.engagement_name or "—",
            "region": p.region or "—",
            "practice_head": (p.practice_head or "").strip() or "—",
            "vertical": p.vertical or "—",
            "bu": (p.hierarchy_tag_bu or "").strip() or None,
            "sbu": (p.hierarchy_tag_sbu or "").strip() or None,
        }
        for p in projects
    ]

    out = {
        "clients": client_rows,
        "selected_client_id": resolved_client_id,
        "projects": project_payload,
        "vertical_options": vertical_options,
        "region_options": region_options,
        "config": merged,
        "sla_metrics": sla_metrics,
        "finance": finance_out,
        "req_by_project": req_by_project,
        "bu_tabs": bu_tabs,
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
