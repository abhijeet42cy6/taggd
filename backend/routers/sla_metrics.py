"""Create / update SLA metric definitions and optional period snapshots (platform UI)."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.auth.deps import get_current_user
from backend.auth.verticals import require_vertical
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.core.sla_period import canonical_month_label
from backend.db.database import (
    MetricDefinition,
    Project,
    SLAPerformance,
    User,
    get_db,
)

router = APIRouter(
    prefix="/sla",
    tags=["sla"],
    dependencies=[Depends(require_vertical("sla"))],
)


class PerformancePayload(BaseModel):
    reporting_month: Optional[str] = None  # YYYY-MM
    period_start: Optional[date] = None
    score: Optional[str] = None
    rag_status: Optional[str] = None


class MetricCreateBody(BaseModel):
    project_id: int
    metric_label: str = Field(..., min_length=1, max_length=2000)
    metric_group: Optional[str] = None
    metric_nature: Optional[str] = None
    target_threshold: Optional[str] = None
    definition: Optional[str] = None
    calculation_method: Optional[str] = None
    formula: Optional[str] = None
    source_system: Optional[str] = None
    performance: Optional[PerformancePayload] = None


class MetricUpdateBody(BaseModel):
    metric_label: Optional[str] = Field(None, min_length=1, max_length=2000)
    metric_group: Optional[str] = None
    metric_nature: Optional[str] = None
    target_threshold: Optional[str] = None
    definition: Optional[str] = None
    calculation_method: Optional[str] = None
    formula: Optional[str] = None
    source_system: Optional[str] = None
    performance: Optional[PerformancePayload] = None


def _serialize_metric(m: MetricDefinition) -> dict[str, Any]:
    p = m.project
    return {
        "id": m.id,
        "project_id": m.project_id,
        "account_name": (p.account_name or p.filename or "") if p else "",
        "metric_label": m.metric_label,
        "metric_group": m.metric_group,
        "metric_nature": m.metric_nature,
        "target_threshold": m.target_threshold,
        "definition": m.definition,
        "calculation_method": m.calculation_method,
        "formula": m.formula,
        "source_system": m.source_system,
    }


def _apply_performance_row(
    db: Session,
    definition_id: int,
    p: PerformancePayload,
    source_tag: str = "platform",
) -> None:
    has_val = any(
        x is not None and x != ""
        for x in (p.reporting_month, p.period_start, p.score, p.rag_status)
    )
    if not has_val:
        return

    period_start = p.period_start
    reporting_month = (p.reporting_month or "").strip() or None

    if period_start:
        reporting_month = canonical_month_label(period_start)
    elif reporting_month:
        if len(reporting_month) >= 7 and reporting_month[4] == "-":
            y = int(reporting_month[:4])
            mo = int(reporting_month[5:7])
            period_start = date(y, mo, 1)
        else:
            raise HTTPException(status_code=400, detail="reporting_month must be YYYY-MM")

    if period_start is None and reporting_month is None:
        if p.score is not None or (p.rag_status is not None and str(p.rag_status).strip() != ""):
            raise HTTPException(
                status_code=400,
                detail="Set reporting_month (YYYY-MM) or period_start for this snapshot.",
            )
        return

    perf = (
        db.query(SLAPerformance)
        .filter(
            SLAPerformance.definition_id == definition_id,
            SLAPerformance.period_start == period_start,
        )
        .first()
    )
    if perf is None and reporting_month:
        perf = (
            db.query(SLAPerformance)
            .filter(
                SLAPerformance.definition_id == definition_id,
                SLAPerformance.reporting_month == reporting_month,
            )
            .first()
        )

    if perf is None:
        perf = SLAPerformance(
            definition_id=definition_id,
            period_start=period_start,
            reporting_month=reporting_month or (canonical_month_label(period_start) if period_start else ""),
            source_filename=source_tag,
        )
        db.add(perf)

    if period_start is not None:
        perf.period_start = period_start
    if reporting_month:
        perf.reporting_month = reporting_month
    if p.score is not None:
        perf.score = p.score
    if p.rag_status is not None and str(p.rag_status).strip() != "":
        perf.rag_status = str(p.rag_status).strip()
    perf.source_filename = source_tag


@router.get("/metrics/{definition_id}")
def get_sla_metric(
    definition_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = (
        db.query(MetricDefinition)
        .options(joinedload(MetricDefinition.project))
        .filter(MetricDefinition.id == definition_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    assert_project_access(user, db, m.project_id)
    return _serialize_metric(m)


@router.post("/metrics")
def create_sla_metric(
    body: MetricCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    project = db.query(Project).filter(Project.id == body.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    label = body.metric_label.strip()
    dup = (
        db.query(MetricDefinition)
        .filter(MetricDefinition.project_id == body.project_id, MetricDefinition.metric_label == label)
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="A metric with this label already exists for this project.")

    m = MetricDefinition(
        project_id=body.project_id,
        metric_label=label,
        metric_group=body.metric_group,
        metric_nature=body.metric_nature,
        target_threshold=body.target_threshold,
        definition=body.definition,
        calculation_method=body.calculation_method,
        formula=body.formula,
        source_system=body.source_system or "platform",
        source_filename="platform",
    )
    db.add(m)
    db.flush()

    if body.performance:
        _apply_performance_row(db, m.id, body.performance)

    db.commit()
    out = (
        db.query(MetricDefinition)
        .options(joinedload(MetricDefinition.project))
        .filter(MetricDefinition.id == m.id)
        .first()
    )
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="sla_metric",
        summary=f"SLA metric created: {label[:120]} (PRJ-{body.project_id})",
        project_id=body.project_id,
        resource_id=str(m.id),
    )
    return _serialize_metric(out)


@router.patch("/metrics/{definition_id}")
def update_sla_metric(
    definition_id: int,
    body: MetricUpdateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = (
        db.query(MetricDefinition)
        .options(joinedload(MetricDefinition.project))
        .filter(MetricDefinition.id == definition_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    assert_project_access(user, db, m.project_id)

    if body.metric_label is not None:
        new_label = body.metric_label.strip()
        dup = (
            db.query(MetricDefinition)
            .filter(
                MetricDefinition.project_id == m.project_id,
                MetricDefinition.metric_label == new_label,
                MetricDefinition.id != m.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Another metric already uses this label for this project.")
        m.metric_label = new_label

    for key in ("metric_group", "metric_nature", "target_threshold", "definition", "calculation_method", "formula", "source_system"):
        val = getattr(body, key)
        if val is not None:
            setattr(m, key, val)

    if body.performance is not None:
        _apply_performance_row(db, m.id, body.performance)

    db.commit()
    db.refresh(m)
    out = (
        db.query(MetricDefinition)
        .options(joinedload(MetricDefinition.project))
        .filter(MetricDefinition.id == m.id)
        .first()
    )
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="sla_metric",
        summary=f"SLA metric updated: {(m.metric_label or '')[:120]} (PRJ-{m.project_id})",
        project_id=m.project_id,
        resource_id=str(definition_id),
    )
    return _serialize_metric(out)
