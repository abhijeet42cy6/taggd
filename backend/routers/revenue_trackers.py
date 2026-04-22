"""Manual weekly revenue forecast + revenue visibility snapshots (platform UI)."""
from __future__ import annotations

import datetime
import os
import re
import shutil
import tempfile
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.core.ingestion_audit import log_ingestion_event
from backend.core.revenue_weekly_submission_core import submission_allows_child_edit
from backend.db.database import RevenueForecastWeekly, RevenueVisibilitySnapshot, RevenueWeeklySubmission, User, get_db

router = APIRouter(
    prefix="/revenue-trackers",
    tags=["revenue-trackers"],
    dependencies=[Depends(require_vertical("revenue_forecast"))],
)

LAKHS_TO_INR = 100_000.0


def _parse_ymd(s: str) -> datetime.datetime:
    s = (s or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if not m:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime.datetime(y, mo, d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid calendar date")


def _lakhs_to_inr(v: float) -> float:
    return float(v) * LAKHS_TO_INR


def _submission_for_project_week(
    db: Session, project_id: int, week_start: datetime.datetime
) -> Optional[RevenueWeeklySubmission]:
    return (
        db.query(RevenueWeeklySubmission)
        .filter(
            RevenueWeeklySubmission.project_id == project_id,
            RevenueWeeklySubmission.week_start_date == week_start,
            RevenueWeeklySubmission.period_type == "weekly",
        )
        .first()
    )


def _serialize_forecast(row: RevenueForecastWeekly) -> dict[str, Any]:
    p = row.project
    return {
        "id": row.id,
        "project_id": row.project_id,
        "account_name": (p.account_name or p.filename or "") if p else "",
        "week_start_date": row.week_start_date.date().isoformat() if row.week_start_date else None,
        "week_label": row.week_label,
        "month_anchor": row.month_anchor.date().isoformat() if row.month_anchor else None,
        "update_date": row.update_date.date().isoformat() if row.update_date else None,
        "revenue_forecast_inr": row.revenue_forecast_inr,
        "adjustment_inr": row.adjustment_inr,
        "penalty_inr": row.penalty_inr,
        "bad_debts_inr": row.bad_debts_inr,
        "mmf_inr": row.mmf_inr,
        "open_fee_inr": row.open_fee_inr,
        "joiner_fee_inr": row.joiner_fee_inr,
        "to_be_offer_fee_inr": row.to_be_offer_fee_inr,
        "net_revenue_inr": row.net_revenue_inr,
        "open_req": row.open_req,
        "joiner_count": row.joiner_count,
        "to_be_offer_count": row.to_be_offer_count,
        "achievement_pct": row.achievement_pct,
        "remarks": row.remarks,
        "entered_by_user_id": row.entered_by_user_id,
        "weekly_submission_id": row.weekly_submission_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _serialize_visibility(row: RevenueVisibilitySnapshot) -> dict[str, Any]:
    p = row.project
    return {
        "id": row.id,
        "project_id": row.project_id,
        "account_name": (p.account_name or p.filename or "") if p else "",
        "as_of_date": row.as_of_date.date().isoformat() if row.as_of_date else None,
        "practice_head": row.practice_head,
        "mmf_inr": row.mmf_inr,
        "open_req": row.open_req,
        "opening_fee_inr": row.opening_fee_inr,
        "joiners_as_on_date": row.joiners_as_on_date,
        "joining_fee_inr": row.joining_fee_inr,
        "yet_to_join": row.yet_to_join,
        "ytj_fee_inr": row.ytj_fee_inr,
        "conversion_rate_pct": row.conversion_rate_pct,
        "revenue_realised_pct": row.revenue_realised_pct,
        "gap_to_mmf_inr": row.gap_to_mmf_inr,
        "status": row.status,
        "entered_by_user_id": row.entered_by_user_id,
        "weekly_submission_id": row.weekly_submission_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


class ForecastWeeklyUpsertBody(BaseModel):
    project_id: int = Field(..., ge=1)
    week_start_date: str = Field(..., min_length=8, max_length=32)
    week_label: Optional[str] = None
    month_anchor: str = Field(..., min_length=8, max_length=32)
    update_date: Optional[str] = None
    revenue_forecast_lakhs: float = 0.0
    adjustment_lakhs: float = 0.0
    penalty_lakhs: float = 0.0
    bad_debts_lakhs: float = 0.0
    mmf_lakhs: float = 0.0
    open_fee_lakhs: float = 0.0
    joiner_fee_lakhs: float = 0.0
    to_be_offer_fee_lakhs: float = 0.0
    net_revenue_lakhs: float = 0.0
    open_req: int = 0
    joiner_count: int = 0
    to_be_offer_count: int = 0
    achievement_pct: Optional[float] = None
    remarks: Optional[str] = None


class VisibilityUpsertBody(BaseModel):
    project_id: int = Field(..., ge=1)
    as_of_date: str = Field(..., min_length=8, max_length=32)
    """When set, snapshot is linked to the weekly governance pack for this ISO week start (YYYY-MM-DD)."""
    week_start_date: Optional[str] = Field(None, min_length=8, max_length=32)
    practice_head: Optional[str] = None
    mmf_inr: float = 0.0
    open_req: int = 0
    opening_fee_inr: float = 0.0
    joiners_as_on_date: int = 0
    joining_fee_inr: float = 0.0
    yet_to_join: int = 0
    ytj_fee_inr: float = 0.0
    conversion_rate_pct: Optional[float] = None
    revenue_realised_pct: Optional[float] = None
    gap_to_mmf_inr: float = 0.0
    status: Optional[str] = None


@router.get("/forecast-weekly")
def list_forecast_weekly(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    q = db.query(RevenueForecastWeekly)
    q = apply_project_scope(q, user, db, RevenueForecastWeekly)
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(RevenueForecastWeekly.project_id == project_id)
    rows = (
        q.order_by(RevenueForecastWeekly.week_start_date.desc())
        .limit(limit)
        .all()
    )
    for r in rows:
        _ = r.project  # lazy
    return {"items": [_serialize_forecast(r) for r in rows]}


@router.post("/forecast-weekly")
def upsert_forecast_weekly(
    body: ForecastWeeklyUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    week_start = _parse_ymd(body.week_start_date)
    sub_gate = _submission_for_project_week(db, body.project_id, week_start)
    if sub_gate and not submission_allows_child_edit(sub_gate.status):
        raise HTTPException(
            status_code=423,
            detail="This week is locked under the revenue pack workflow (submitted or approved).",
        )
    month_anchor = _parse_ymd(body.month_anchor)
    upd = _parse_ymd(body.update_date) if body.update_date else datetime.datetime.utcnow().replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    existing = (
        db.query(RevenueForecastWeekly)
        .filter(
            RevenueForecastWeekly.project_id == body.project_id,
            RevenueForecastWeekly.week_start_date == week_start,
        )
        .first()
    )
    is_create = existing is None
    row = existing or RevenueForecastWeekly(project_id=body.project_id, week_start_date=week_start)
    row.week_label = body.week_label
    row.month_anchor = month_anchor
    row.update_date = upd
    row.revenue_forecast_inr = _lakhs_to_inr(body.revenue_forecast_lakhs)
    row.adjustment_inr = _lakhs_to_inr(body.adjustment_lakhs)
    row.penalty_inr = _lakhs_to_inr(body.penalty_lakhs)
    row.bad_debts_inr = _lakhs_to_inr(body.bad_debts_lakhs)
    row.mmf_inr = _lakhs_to_inr(body.mmf_lakhs)
    row.open_fee_inr = _lakhs_to_inr(body.open_fee_lakhs)
    row.joiner_fee_inr = _lakhs_to_inr(body.joiner_fee_lakhs)
    row.to_be_offer_fee_inr = _lakhs_to_inr(body.to_be_offer_fee_lakhs)
    row.net_revenue_inr = _lakhs_to_inr(body.net_revenue_lakhs)
    row.open_req = body.open_req
    row.joiner_count = body.joiner_count
    row.to_be_offer_count = body.to_be_offer_count
    row.achievement_pct = body.achievement_pct
    row.remarks = body.remarks
    row.entered_by_user_id = user.id
    if is_create:
        db.add(row)
    db.flush()
    pack_sub = _submission_for_project_week(db, body.project_id, week_start)
    if pack_sub is None:
        pack_sub = RevenueWeeklySubmission(
            project_id=body.project_id,
            week_start_date=week_start,
            period_type="weekly",
            status="draft",
        )
        db.add(pack_sub)
        db.flush()
    row.weekly_submission_id = pack_sub.id
    db.flush()
    _ = row.project
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="create" if is_create else "update",
        resource_type="revenue_forecast_weekly",
        summary=(
            f"{'Created' if is_create else 'Updated'} weekly forecast — week {week_start.date().isoformat()} "
            f"(PRJ-{body.project_id})"
        ),
        project_id=body.project_id,
        resource_id=f"{body.project_id}:{week_start.date().isoformat()}",
    )
    return _serialize_forecast(row)


@router.delete("/forecast-weekly/{row_id}")
def delete_forecast_weekly(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(RevenueForecastWeekly).filter(RevenueForecastWeekly.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    assert_project_access(user, db, row.project_id)
    if row.weekly_submission_id:
        s = (
            db.query(RevenueWeeklySubmission)
            .filter(RevenueWeeklySubmission.id == row.weekly_submission_id)
            .first()
        )
        if s and not submission_allows_child_edit(s.status):
            raise HTTPException(
                status_code=423,
                detail="Cannot delete forecast while weekly pack is submitted or approved.",
            )
    pid, key = row.project_id, row.week_start_date.date().isoformat() if row.week_start_date else str(row_id)
    db.delete(row)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="revenue_forecast_weekly",
        summary=f"Deleted weekly forecast — week {key} (PRJ-{pid})",
        project_id=pid,
        resource_id=f"{pid}:{key}",
    )
    return {"status": "ok", "id": row_id}


@router.get("/visibility")
def list_visibility(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    q = db.query(RevenueVisibilitySnapshot)
    q = apply_project_scope(q, user, db, RevenueVisibilitySnapshot)
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(RevenueVisibilitySnapshot.project_id == project_id)
    rows = (
        q.order_by(RevenueVisibilitySnapshot.as_of_date.desc())
        .limit(limit)
        .all()
    )
    for r in rows:
        _ = r.project
    return {"items": [_serialize_visibility(r) for r in rows]}


@router.post("/visibility")
def upsert_visibility(
    body: VisibilityUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    as_of = _parse_ymd(body.as_of_date)
    if body.week_start_date and str(body.week_start_date).strip():
        ws_chk = _parse_ymd(str(body.week_start_date).strip())
        sub_chk = _submission_for_project_week(db, body.project_id, ws_chk)
        if sub_chk and not submission_allows_child_edit(sub_chk.status):
            raise HTTPException(
                status_code=423,
                detail="This week is locked under the revenue pack workflow (submitted or approved).",
            )

    existing = (
        db.query(RevenueVisibilitySnapshot)
        .filter(
            RevenueVisibilitySnapshot.project_id == body.project_id,
            RevenueVisibilitySnapshot.as_of_date == as_of,
        )
        .first()
    )
    is_create = existing is None
    row = existing or RevenueVisibilitySnapshot(project_id=body.project_id, as_of_date=as_of)
    row.practice_head = body.practice_head
    row.mmf_inr = float(body.mmf_inr)
    row.open_req = body.open_req
    row.opening_fee_inr = float(body.opening_fee_inr)
    row.joiners_as_on_date = body.joiners_as_on_date
    row.joining_fee_inr = float(body.joining_fee_inr)
    row.yet_to_join = body.yet_to_join
    row.ytj_fee_inr = float(body.ytj_fee_inr)
    row.conversion_rate_pct = body.conversion_rate_pct
    row.revenue_realised_pct = body.revenue_realised_pct
    row.gap_to_mmf_inr = float(body.gap_to_mmf_inr)
    row.status = body.status
    row.entered_by_user_id = user.id
    if is_create:
        db.add(row)
    db.flush()
    if body.week_start_date and str(body.week_start_date).strip():
        ws = _parse_ymd(str(body.week_start_date).strip())
        pack_sub = _submission_for_project_week(db, body.project_id, ws)
        if pack_sub is None:
            pack_sub = RevenueWeeklySubmission(
                project_id=body.project_id,
                week_start_date=ws,
                period_type="weekly",
                status="draft",
            )
            db.add(pack_sub)
            db.flush()
        row.weekly_submission_id = pack_sub.id
    db.flush()
    _ = row.project
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="create" if is_create else "update",
        resource_type="revenue_visibility_snapshot",
        summary=(
            f"{'Created' if is_create else 'Updated'} revenue visibility — as-of {as_of.date().isoformat()} "
            f"(PRJ-{body.project_id})"
        ),
        project_id=body.project_id,
        resource_id=f"{body.project_id}:{as_of.date().isoformat()}",
    )
    return _serialize_visibility(row)


@router.delete("/visibility/{row_id}")
def delete_visibility(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(RevenueVisibilitySnapshot).filter(RevenueVisibilitySnapshot.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    assert_project_access(user, db, row.project_id)
    if row.weekly_submission_id:
        s = (
            db.query(RevenueWeeklySubmission)
            .filter(RevenueWeeklySubmission.id == row.weekly_submission_id)
            .first()
        )
        if s and not submission_allows_child_edit(s.status):
            raise HTTPException(
                status_code=423,
                detail="Cannot delete visibility while weekly pack is submitted or approved.",
            )
    pid, key = row.project_id, row.as_of_date.date().isoformat() if row.as_of_date else str(row_id)
    db.delete(row)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="revenue_visibility_snapshot",
        summary=f"Deleted revenue visibility — as-of {key} (PRJ-{pid})",
        project_id=pid,
        resource_id=f"{pid}:{key}",
    )
    return {"status": "ok", "id": row_id}


@router.post("/ingest-upload")
async def ingest_revenue_trackers_upload(
    forecast_file: Optional[UploadFile] = File(None),
    visibility_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ingest TAGGD revenue forecast and/or visibility Excel workbooks (same rules as CLI script)."""
    if (not forecast_file or not forecast_file.filename) and (
        not visibility_file or not visibility_file.filename
    ):
        raise HTTPException(
            status_code=400,
            detail="Provide at least one file: forecast_file (Revenue Forecast Data sheet) and/or "
            "visibility_file (Revenue Tracker sheet).",
        )

    temp_paths: list[str] = []
    forecast_path: Optional[str] = None
    visibility_path: Optional[str] = None
    name_parts: list[str] = []

    try:
        if forecast_file and forecast_file.filename:
            safe = os.path.basename(forecast_file.filename) or "forecast.xlsx"
            name_parts.append(safe)
            forecast_path = os.path.join(
                tempfile.gettempdir(), f"rev_forecast_{int(time.time())}_{safe}"
            )
            with open(forecast_path, "wb") as buf:
                shutil.copyfileobj(forecast_file.file, buf)
            temp_paths.append(forecast_path)

        if visibility_file and visibility_file.filename:
            safe = os.path.basename(visibility_file.filename) or "visibility.xlsx"
            name_parts.append(safe)
            visibility_path = os.path.join(
                tempfile.gettempdir(), f"rev_visibility_{int(time.time())}_{safe}"
            )
            with open(visibility_path, "wb") as buf:
                shutil.copyfileobj(visibility_file.file, buf)
            temp_paths.append(visibility_path)

        from backend.scripts.ingest_revenue_trackers import ingest_revenue_workbooks

        out = ingest_revenue_workbooks(forecast_path, visibility_path, db=db, dry_run=False)
        log_ingestion_event(
            db,
            user=user,
            kind="revenue_trackers",
            filename=" + ".join(name_parts) if name_parts else "revenue-templates.xlsx",
            status="success",
            label="Complete",
            project_id=None,
        )
        return {"status": "success", **out}
    except ValueError as e:
        log_ingestion_event(
            db,
            user=user,
            kind="revenue_trackers",
            filename=" + ".join(name_parts) if name_parts else "revenue-templates.xlsx",
            status="error",
            label=str(e)[:120],
            project_id=None,
        )
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        log_ingestion_event(
            db,
            user=user,
            kind="revenue_trackers",
            filename=" + ".join(name_parts) if name_parts else "revenue-templates.xlsx",
            status="error",
            label="Failed",
            project_id=None,
        )
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        for p in temp_paths:
            try:
                if p and os.path.isfile(p):
                    os.remove(p)
            except OSError:
                pass
