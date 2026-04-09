"""CRUD for platform meeting records (MoM / governance tracking)."""
from __future__ import annotations

import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.auth.deps import allowed_project_ids, get_current_user
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import Meeting, MeetingActionItem, User, get_db

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _apply_meeting_scope(q, user: User, db: Session):
    ids = allowed_project_ids(user, db)
    if ids is None:
        return q
    if len(ids) == 0:
        return q.filter(Meeting.created_by_user_id == user.id)
    return q.filter(
        or_(
            Meeting.project_id.in_(ids),
            and_(Meeting.project_id.is_(None), Meeting.created_by_user_id == user.id),
        )
    )


def _assert_meeting_access(user: User, db: Session, m: Meeting) -> None:
    ids = allowed_project_ids(user, db)
    if ids is None:
        return
    if m.project_id is not None and m.project_id in ids:
        return
    if m.project_id is None and m.created_by_user_id == user.id:
        return
    raise HTTPException(status_code=403, detail="Access denied for this meeting")


def _parse_date(s: Optional[str]) -> Optional[datetime.date]:
    if s is None or not str(s).strip():
        return None
    t = str(s).strip()[:10]
    try:
        return datetime.date.fromisoformat(t)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s!r} (use YYYY-MM-DD)")


def _date_out(d: Optional[datetime.date]) -> Optional[str]:
    if d is None:
        return None
    return d.isoformat()


class MeetingActionItemIn(BaseModel):
    description: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    sort_order: int = 0


class MeetingCreate(BaseModel):
    meeting_title: Optional[str] = None
    meeting_type: Optional[str] = None
    meeting_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    organizer_user_id: Optional[int] = None
    organizer_name: Optional[str] = None
    attendees_internal: Optional[str] = None
    attendees_external: Optional[str] = None
    external_attendees_json: Optional[List[dict[str, Any]]] = None
    project_id: Optional[int] = None
    account_name_snapshot: Optional[str] = None
    agenda_items: Optional[str] = None
    discussion_summary: Optional[str] = None
    decisions_taken: Optional[str] = None
    key_discussion_points: Optional[str] = None
    follow_up_date: Optional[str] = None
    next_meeting_date: Optional[str] = None
    meeting_mode: Optional[str] = None
    meeting_status: Optional[str] = None
    attachments_json: Optional[List[Any]] = None
    mom_status: Optional[str] = None
    mom_link_remarks: Optional[str] = None
    action_items: List[MeetingActionItemIn] = Field(default_factory=list)


class MeetingPatch(BaseModel):
    meeting_title: Optional[str] = None
    meeting_type: Optional[str] = None
    meeting_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    organizer_user_id: Optional[int] = None
    organizer_name: Optional[str] = None
    attendees_internal: Optional[str] = None
    attendees_external: Optional[str] = None
    external_attendees_json: Optional[List[dict[str, Any]]] = None
    project_id: Optional[int] = None
    account_name_snapshot: Optional[str] = None
    agenda_items: Optional[str] = None
    discussion_summary: Optional[str] = None
    decisions_taken: Optional[str] = None
    key_discussion_points: Optional[str] = None
    follow_up_date: Optional[str] = None
    next_meeting_date: Optional[str] = None
    meeting_mode: Optional[str] = None
    meeting_status: Optional[str] = None
    attachments_json: Optional[List[Any]] = None
    mom_status: Optional[str] = None
    mom_link_remarks: Optional[str] = None
    action_items: Optional[List[MeetingActionItemIn]] = None


def _action_row_to_dict(a: MeetingActionItem) -> dict[str, Any]:
    return {
        "id": a.id,
        "description": a.description,
        "owner": a.owner,
        "due_date": _date_out(a.due_date),
        "status": a.status,
        "sort_order": a.sort_order,
    }


def meeting_to_dict(m: Meeting) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in Meeting.__table__.columns:
        v = getattr(m, col.name, None)
        if isinstance(v, datetime.date) and not isinstance(v, datetime.datetime):
            out[col.name] = v.isoformat()
        elif isinstance(v, datetime.datetime):
            out[col.name] = v.isoformat()
        else:
            out[col.name] = v
    out["action_items"] = [_action_row_to_dict(a) for a in (m.action_items or [])]
    return out


def _apply_meeting_body(m: Meeting, data: dict[str, Any], *, skip_action_items: bool) -> None:
    date_keys = ("meeting_date", "follow_up_date", "next_meeting_date")
    for k, v in data.items():
        if k in ("action_items",):
            continue
        if k in date_keys:
            setattr(m, k, _parse_date(v) if v else None)
        elif hasattr(m, k):
            setattr(m, k, v)
    if not skip_action_items and "action_items" in data:
        m.action_items.clear()
        for i, row in enumerate(data["action_items"] or []):
            if isinstance(row, MeetingActionItemIn):
                rd = row.model_dump()
            else:
                rd = dict(row)
            m.action_items.append(
                MeetingActionItem(
                    description=rd.get("description"),
                    owner=rd.get("owner"),
                    due_date=_parse_date(rd.get("due_date")) if rd.get("due_date") else None,
                    status=rd.get("status"),
                    sort_order=int(rd.get("sort_order") or i),
                )
            )


@router.get("")
def list_meetings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Meeting)
    q = _apply_meeting_scope(q, user, db)
    rows = q.order_by(Meeting.id.desc()).limit(2000).all()
    return [meeting_to_dict(r) for r in rows]


@router.get("/{meeting_id}")
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    return meeting_to_dict(m)


@router.post("")
def create_meeting(
    body: MeetingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.project_id is not None:
        assert_project_access(user, db, body.project_id)
    try:
        payload = body.model_dump()
    except AttributeError:
        payload = body.dict()
    items = payload.pop("action_items", []) or []
    m = Meeting(
        created_by_user_id=user.id,
        created_by_email=(user.email or "").strip() or None,
    )
    _apply_meeting_body(m, {**payload, "action_items": items}, skip_action_items=False)
    db.add(m)
    db.commit()
    db.refresh(m)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="meeting",
        summary=f"Meeting logged: {m.meeting_title or m.id}",
        project_id=m.project_id,
        resource_id=str(m.id),
    )
    return meeting_to_dict(m)


@router.patch("/{meeting_id}")
def patch_meeting(
    meeting_id: int,
    body: MeetingPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    if "project_id" in data and data["project_id"] is not None:
        assert_project_access(user, db, int(data["project_id"]))
    has_actions = "action_items" in data
    _apply_meeting_body(m, data, skip_action_items=not has_actions)
    db.commit()
    db.refresh(m)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="meeting",
        summary=f"Meeting updated (MTG-{meeting_id})",
        project_id=m.project_id,
        resource_id=str(meeting_id),
    )
    return meeting_to_dict(m)


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    pid = m.project_id
    db.delete(m)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="meeting",
        summary=f"Meeting deleted (MTG-{meeting_id})",
        project_id=pid,
        resource_id=str(meeting_id),
    )
    return {"status": "ok", "id": meeting_id}
