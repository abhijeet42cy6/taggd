"""Weekly revenue pack governance: submit forecast+visibility, finance approve."""
from __future__ import annotations

import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.auth.deps import get_current_user
from backend.auth.profile import effective_role, profile_may_access_vertical, resolve_user_profile
from backend.auth.scope import apply_project_scope, assert_client_access, assert_project_access
from backend.core.activity_log import log_activity
from backend.core.revenue_weekly_submission_core import (
    ST_APPROVED,
    ST_CHANGES_REQUESTED,
    ST_DRAFT,
    ST_REJECTED,
    ST_SUBMITTED,
    ST_UNDER_REVIEW,
)
from backend.db.database import Project, RevenueForecastWeekly, RevenueVisibilitySnapshot, RevenueWeeklySubmission, User, get_db
from backend.routers.revenue_trackers import _parse_ymd, _serialize_forecast, _serialize_visibility

router = APIRouter(prefix="/revenue-weekly-submissions", tags=["revenue-weekly-submissions"])


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime.datetime):
        return dt.isoformat()
    return str(dt)


def _user_label(u: Optional[User]) -> Optional[dict[str, Any]]:
    if not u:
        return None
    return {"id": u.id, "email": u.email, "role": u.role}


def _serialize_submission(s: RevenueWeeklySubmission, db: Session) -> dict[str, Any]:
    _ = (
        s.submitted_by,
        s.reviewed_by,
        s.approved_by,
    )
    return {
        "id": s.id,
        "project_id": s.project_id,
        "week_start_date": s.week_start_date.date().isoformat() if s.week_start_date else None,
        "period_type": s.period_type,
        "status": s.status,
        "submitted_by_user_id": s.submitted_by_user_id,
        "submitted_at": _iso(s.submitted_at),
        "submitted_by": _user_label(s.submitted_by),
        "reviewed_by_user_id": s.reviewed_by_user_id,
        "reviewed_at": _iso(s.reviewed_at),
        "review_notes": s.review_notes,
        "reviewed_by": _user_label(s.reviewed_by),
        "approved_by_user_id": s.approved_by_user_id,
        "approved_at": _iso(s.approved_at),
        "approved_by": _user_label(s.approved_by),
        "version": s.version,
        "created_at": _iso(s.created_at),
        "updated_at": _iso(s.updated_at),
    }


def _may_revenue_forecast_vertical(user: User, db: Session) -> bool:
    p = resolve_user_profile(db.query(User).filter(User.id == user.id).first() or user, db)
    return profile_may_access_vertical(p, "revenue_forecast")


def _may_revenue_kpi_governance(user: User, db: Session) -> bool:
    p = resolve_user_profile(db.query(User).filter(User.id == user.id).first() or user, db)
    return profile_may_access_vertical(p, "revenue_kpi_governance")


def _practice_may_submit_weekly_pack(user: User, db: Session) -> bool:
    r = effective_role(user)
    if r in ("platform_admin", "executive", "project_head"):
        return _may_revenue_forecast_vertical(user, db)
    if r == "operations":
        return _may_revenue_forecast_vertical(user, db)
    return False


def _load_submission(db: Session, submission_id: int) -> RevenueWeeklySubmission:
    s = (
        db.query(RevenueWeeklySubmission)
        .options(
            joinedload(RevenueWeeklySubmission.submitted_by),
            joinedload(RevenueWeeklySubmission.reviewed_by),
            joinedload(RevenueWeeklySubmission.approved_by),
        )
        .filter(RevenueWeeklySubmission.id == submission_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")
    return s


@router.get("/pack")
def get_pack(
    project_id: int = Query(..., ge=1),
    week_start_date: str = Query(..., min_length=8, max_length=32),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    if not (_may_revenue_forecast_vertical(user, db) or _may_revenue_kpi_governance(user, db)):
        raise HTTPException(status_code=403, detail="Missing revenue_forecast or revenue_kpi_governance access")
    ws = _parse_ymd(week_start_date)
    sub = (
        db.query(RevenueWeeklySubmission)
        .options(
            joinedload(RevenueWeeklySubmission.submitted_by),
            joinedload(RevenueWeeklySubmission.reviewed_by),
            joinedload(RevenueWeeklySubmission.approved_by),
        )
        .filter(
            RevenueWeeklySubmission.project_id == project_id,
            RevenueWeeklySubmission.week_start_date == ws,
            RevenueWeeklySubmission.period_type == "weekly",
        )
        .first()
    )
    fc = (
        db.query(RevenueForecastWeekly)
        .filter(
            RevenueForecastWeekly.project_id == project_id,
            RevenueForecastWeekly.week_start_date == ws,
        )
        .first()
    )
    if fc:
        _ = fc.project
    vis = None
    if sub:
        vis = (
            db.query(RevenueVisibilitySnapshot)
            .filter(
                RevenueVisibilitySnapshot.project_id == project_id,
                RevenueVisibilitySnapshot.weekly_submission_id == sub.id,
            )
            .first()
        )
        if vis:
            _ = vis.project
    if not sub:
        return {
            "submission": None,
            "forecast": _serialize_forecast(fc) if fc else None,
            "visibility": _serialize_visibility(vis) if vis else None,
        }
    return {
        "submission": _serialize_submission(sub, db),
        "forecast": _serialize_forecast(fc) if fc else None,
        "visibility": _serialize_visibility(vis) if vis else None,
    }


@router.get("/mine-packs")
def list_my_packs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
):
    """Weekly packs for projects in scope — project head / practice lead only."""
    if not _may_revenue_forecast_vertical(user, db):
        raise HTTPException(status_code=403, detail="revenue_forecast vertical required")
    er = effective_role(user)
    if er not in ("project_head", "manager"):
        raise HTTPException(status_code=403, detail="Pack history is available to project heads")
    q = (
        db.query(RevenueWeeklySubmission)
        .options(
            joinedload(RevenueWeeklySubmission.submitted_by),
            joinedload(RevenueWeeklySubmission.approved_by),
            joinedload(RevenueWeeklySubmission.project),
        )
    )
    q = apply_project_scope(q, user, db, RevenueWeeklySubmission)
    rows = q.order_by(RevenueWeeklySubmission.updated_at.desc()).limit(limit).all()
    out = []
    for s in rows:
        _ = s.project
        item = _serialize_submission(s, db)
        item["account_name"] = (s.project.account_name or s.project.filename or "") if s.project else ""
        item["client_id"] = s.project.client_id if s.project else None
        out.append(item)
    return {"items": out, "total": len(out), "limit": limit, "offset": 0}


@router.get("/queue")
def list_queue(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: Optional[str] = Query(None),
    client_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    q = db.query(RevenueWeeklySubmission).join(Project, RevenueWeeklySubmission.project_id == Project.id)
    q = apply_project_scope(q, user, db, RevenueWeeklySubmission)
    if client_id is not None:
        assert_client_access(user, db, client_id)
        q = q.filter(Project.client_id == client_id)
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(RevenueWeeklySubmission.project_id == project_id)
    if status and str(status).strip():
        st = str(status).strip().lower()
        if st == "needs_review":
            q = q.filter(RevenueWeeklySubmission.status.in_([ST_SUBMITTED, ST_UNDER_REVIEW]))
        else:
            q = q.filter(RevenueWeeklySubmission.status == st)
    q = q.options(
        joinedload(RevenueWeeklySubmission.submitted_by),
        joinedload(RevenueWeeklySubmission.approved_by),
        joinedload(RevenueWeeklySubmission.project),
    )
    total = q.count()
    rows = q.order_by(RevenueWeeklySubmission.updated_at.desc()).offset(offset).limit(limit).all()
    out = []
    for s in rows:
        _ = s.project
        item = _serialize_submission(s, db)
        item["account_name"] = (s.project.account_name or s.project.filename or "") if s.project else ""
        item["client_id"] = s.project.client_id if s.project else None
        out.append(item)
    return {"items": out, "total": total, "limit": limit, "offset": offset}


class NotesBody(BaseModel):
    notes: Optional[str] = Field(None, max_length=4000)


@router.post("/{submission_id}/submit")
def submit_pack(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _practice_may_submit_weekly_pack(user, db):
        raise HTTPException(status_code=403, detail="Only project heads, operations, executive, or platform admin may submit")
    s = _load_submission(db, submission_id)
    assert_project_access(user, db, s.project_id)
    st = (s.status or "").lower()
    if st not in (ST_DRAFT, ST_CHANGES_REQUESTED, ST_REJECTED):
        raise HTTPException(status_code=400, detail=f"Cannot submit from status {s.status}")
    fc = (
        db.query(RevenueForecastWeekly)
        .filter(
            RevenueForecastWeekly.project_id == s.project_id,
            RevenueForecastWeekly.week_start_date == s.week_start_date,
        )
        .first()
    )
    if not fc:
        raise HTTPException(status_code=400, detail="Weekly forecast row is required before submit")
    s.status = ST_SUBMITTED
    s.submitted_by_user_id = user.id
    s.submitted_at = datetime.datetime.utcnow()
    s.review_notes = None
    db.commit()
    db.refresh(s)
    log_activity(
        db,
        user=user,
        action="submit",
        resource_type="revenue_weekly_submission",
        summary=f"Weekly revenue pack submitted PRJ-{s.project_id} week {s.week_start_date.date().isoformat()}",
        project_id=s.project_id,
        resource_id=str(s.id),
    )
    return _serialize_submission(s, db)


@router.post("/{submission_id}/start-review")
def start_review(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    s = _load_submission(db, submission_id)
    assert_project_access(user, db, s.project_id)
    if (s.status or "").lower() != ST_SUBMITTED:
        raise HTTPException(status_code=400, detail="Can only start review from submitted")
    s.status = ST_UNDER_REVIEW
    s.reviewed_by_user_id = user.id
    s.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(s)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="revenue_weekly_submission",
        summary=f"Weekly pack under review PRJ-{s.project_id} #{s.id}",
        project_id=s.project_id,
        resource_id=str(s.id),
    )
    return _serialize_submission(s, db)


@router.post("/{submission_id}/approve")
def approve_pack(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    s = _load_submission(db, submission_id)
    assert_project_access(user, db, s.project_id)
    st = (s.status or "").lower()
    if st not in (ST_SUBMITTED, ST_UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Can only approve from submitted or under_review")
    s.status = ST_APPROVED
    s.approved_by_user_id = user.id
    s.approved_at = datetime.datetime.utcnow()
    if not s.reviewed_by_user_id:
        s.reviewed_by_user_id = user.id
        s.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(s)
    log_activity(
        db,
        user=user,
        action="approve",
        resource_type="revenue_weekly_submission",
        summary=f"Weekly pack approved PRJ-{s.project_id} week {s.week_start_date.date().isoformat()}",
        project_id=s.project_id,
        resource_id=str(s.id),
    )
    return _serialize_submission(s, db)


@router.post("/{submission_id}/request-changes")
def request_changes(
    submission_id: int,
    body: NotesBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    s = _load_submission(db, submission_id)
    assert_project_access(user, db, s.project_id)
    st = (s.status or "").lower()
    if st not in (ST_SUBMITTED, ST_UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Invalid status for request-changes")
    s.status = ST_CHANGES_REQUESTED
    s.reviewed_by_user_id = user.id
    s.reviewed_at = datetime.datetime.utcnow()
    s.review_notes = (body.notes or "").strip() or None
    db.commit()
    db.refresh(s)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="revenue_weekly_submission",
        summary=f"Weekly pack changes requested PRJ-{s.project_id} #{s.id}",
        project_id=s.project_id,
        resource_id=str(s.id),
    )
    return _serialize_submission(s, db)


@router.post("/{submission_id}/reject")
def reject_pack(
    submission_id: int,
    body: NotesBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    s = _load_submission(db, submission_id)
    assert_project_access(user, db, s.project_id)
    st = (s.status or "").lower()
    if st not in (ST_SUBMITTED, ST_UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Invalid status for reject")
    s.status = ST_REJECTED
    s.reviewed_by_user_id = user.id
    s.reviewed_at = datetime.datetime.utcnow()
    s.review_notes = (body.notes or "").strip() or None
    db.commit()
    db.refresh(s)
    log_activity(
        db,
        user=user,
        action="reject",
        resource_type="revenue_weekly_submission",
        summary=f"Weekly pack rejected PRJ-{s.project_id} #{s.id}",
        project_id=s.project_id,
        resource_id=str(s.id),
    )
    return _serialize_submission(s, db)


@router.get("/by-client/{client_id}/summary")
def client_summary(
    client_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _may_revenue_kpi_governance(user, db):
        raise HTTPException(status_code=403, detail="revenue_kpi_governance vertical required")
    assert_client_access(user, db, client_id)
    pids = [r[0] for r in db.query(Project.id).filter(Project.client_id == client_id).all()]
    if not pids:
        return {"client_id": client_id, "pending_count": 0, "project_ids": []}
    pending = (
        db.query(RevenueWeeklySubmission)
        .filter(
            RevenueWeeklySubmission.project_id.in_(pids),
            RevenueWeeklySubmission.status.in_([ST_SUBMITTED, ST_UNDER_REVIEW]),
        )
        .count()
    )
    return {"client_id": client_id, "pending_count": pending, "project_ids": pids}
