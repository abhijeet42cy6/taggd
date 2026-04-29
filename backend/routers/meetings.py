"""CRUD for platform meeting records (MoM / governance tracking)."""
from __future__ import annotations

import datetime
import os
import re
from typing import Any, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.auth.deps import allowed_project_ids, get_current_user
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.core.composio_config import ComposioConfig, build_composio_user_id, load_composio_config
from backend.db.database import Meeting, MeetingActionItem, User, UserComposioConnection, get_db

router = APIRouter(
    prefix="/meetings",
    tags=["meetings"],
    dependencies=[Depends(require_vertical("meetings"))],
)


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


def _parse_datetime(s: Optional[str]) -> Optional[datetime.datetime]:
    if s is None or not str(s).strip():
        return None
    raw = str(s).strip()
    raw = re.sub(r"(\.\d{6})\d+", r"\1", raw)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.datetime.fromisoformat(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {s!r} (use ISO-8601)")


def _latest_connection(db: Session, user_id: int) -> Optional[UserComposioConnection]:
    return (
        db.query(UserComposioConnection)
        .filter(
            UserComposioConnection.user_id == user_id,
            UserComposioConnection.provider == "microsoft",
        )
        .order_by(UserComposioConnection.id.desc())
        .first()
    )


def _normalize_connection_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"active", "connected", "success", "successful", "completed", "ok"}:
        return "connected"
    if raw in {"expired", "revoked", "failed", "error", "disconnected", "inactive"}:
        return "failed"
    return "unknown"


def _fetch_connected_account(cfg: ComposioConfig, connection_id: str) -> Optional[dict[str, Any]]:
    cid = str(connection_id or "").strip()
    if not cfg.configured or not cid.startswith("ca_"):
        return None
    try:
        r = requests.get(
            f"{cfg.base_url}/api/v3/connected_accounts/{cid}",
            headers={"x-api-key": cfg.api_key or ""},
            timeout=20,
        )
        if 200 <= r.status_code < 300:
            body = r.json() if r.content else {}
            return body if isinstance(body, dict) else None
    except Exception:
        return None
    return None


def _active_connection(db: Session, cfg: ComposioConfig, user: User) -> Optional[UserComposioConnection]:
    row = _latest_connection(db, user.id)
    if not row or not str(row.connection_id or "").startswith("ca_"):
        return None
    if row.status == "connected" and row.disconnected_at is None:
        return row
    remote = _fetch_connected_account(cfg, str(row.connection_id or ""))
    if not remote:
        return None
    status = _normalize_connection_status(remote.get("status") or (remote.get("data") or {}).get("status"))
    if status != "connected":
        return None
    row.status = "connected"
    row.disconnected_at = None
    remote_user_id = remote.get("user_id")
    if isinstance(remote_user_id, str) and remote_user_id.strip():
        row.external_user_id = remote_user_id.strip()[:255]
    db.commit()
    db.refresh(row)
    return row


def _split_emails(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[;,\n]", str(raw))
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        cand = p.strip()
        if not cand:
            continue
        if "@" not in cand:
            continue
        key = cand.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cand)
    return out


def _meeting_time_zone() -> str:
    return (os.getenv("COMPOSIO_OUTLOOK_TIMEZONE") or "Asia/Kolkata").strip() or "Asia/Kolkata"


def _meeting_datetime_strings(m: Meeting) -> Optional[tuple[str, str]]:
    d = m.meeting_date
    if d is None:
        return None
    try:
        start_time = datetime.time.fromisoformat((m.start_time or "").strip()[:8] or "09:00")
    except ValueError:
        start_time = datetime.time(9, 0)
    try:
        end_time = datetime.time.fromisoformat((m.end_time or "").strip()[:8] or "")
    except ValueError:
        end_time = datetime.time(0, 0)
    start_dt = datetime.datetime.combine(d, start_time)
    if not (m.end_time or "").strip():
        end_dt = start_dt + datetime.timedelta(minutes=30)
    else:
        end_dt = datetime.datetime.combine(d, end_time)
        if end_dt <= start_dt:
            end_dt = start_dt + datetime.timedelta(minutes=30)
    return start_dt.strftime("%Y-%m-%dT%H:%M:%S"), end_dt.strftime("%Y-%m-%dT%H:%M:%S")


def _meeting_body_text(m: Meeting) -> str:
    parts: list[str] = []
    if m.agenda_items:
        parts.append(f"Agenda: {m.agenda_items}")
    if m.discussion_summary:
        parts.append(f"Discussion summary: {m.discussion_summary}")
    if m.decisions_taken:
        parts.append(f"Decisions: {m.decisions_taken}")
    if m.key_discussion_points:
        parts.append(f"Key points: {m.key_discussion_points}")
    if m.mom_link_remarks:
        parts.append(f"Notes: {m.mom_link_remarks}")
    return "\n\n".join(parts).strip() or "Meeting synced from RevAgent."


def _meeting_attendees(m: Meeting) -> list[dict[str, Any]]:
    emails = _split_emails(m.attendees_internal) + _split_emails(m.attendees_external)
    uniq: list[str] = []
    seen: set[str] = set()
    for e in emails:
        k = e.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(e)
    return [{"emailAddress": {"address": e}, "type": "required"} for e in uniq]


def _execute_tool(
    cfg: ComposioConfig,
    row: UserComposioConnection,
    tool_slug: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    fallback_email = getattr(getattr(row, "user", None), "email", None)
    payload = {
        "connected_account_id": row.connection_id,
        "user_id": (
            row.external_user_id
            or build_composio_user_id(cfg, email=fallback_email, user_id=row.user_id)
        ),
        "arguments": arguments,
    }
    try:
        r = requests.post(
            f"{cfg.base_url}/api/v3.1/tools/execute/{tool_slug}",
            headers={"x-api-key": cfg.api_key or "", "Content-Type": "application/json"},
            json=payload,
            timeout=45,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Outlook sync request failed: {e}") from e
    body = r.json() if r.content else {}
    if not (200 <= r.status_code < 300):
        detail = None
        if isinstance(body, dict):
            err = body.get("error")
            detail = err.get("message") if isinstance(err, dict) else err
        raise HTTPException(status_code=502, detail=str(detail or f"Composio error ({r.status_code})"))
    if not isinstance(body, dict) or not bool(body.get("successful", True)):
        raise HTTPException(status_code=502, detail=str((body or {}).get("error") or "Outlook sync failed"))
    data = body.get("data")
    return data if isinstance(data, dict) else {}


def _sync_meeting_to_outlook(
    db: Session,
    user: User,
    m: Meeting,
    *,
    force_create: bool,
) -> Optional[str]:
    cfg = load_composio_config()
    if not cfg.configured:
        return None
    row = _active_connection(db, cfg, user)
    if not row:
        return None

    dt_pair = _meeting_datetime_strings(m)
    if not dt_pair:
        return None
    start_text, end_text = dt_pair
    tz = _meeting_time_zone()
    subject = (m.meeting_title or f"Meeting MTG-{m.id}").strip()[:255]
    attendees = _meeting_attendees(m)
    location_text = (m.account_name_snapshot or "").strip()
    create_needed = force_create or not (m.teams_event_id or "").strip() or str(m.teams_event_id).startswith(("mtg-", "local-mtg-"))
    action = "updated"
    if create_needed:
        create_args: dict[str, Any] = {
            "subject": subject,
            "start": {"dateTime": start_text, "timeZone": tz},
            "end": {"dateTime": end_text, "timeZone": tz},
            "body": {"contentType": "Text", "content": _meeting_body_text(m)},
        }
        if attendees:
            create_args["attendees"] = attendees
        if location_text:
            create_args["location"] = {"displayName": location_text}
        if (m.meeting_mode or "").strip().lower() in {"video", "hybrid"}:
            create_args["isOnlineMeeting"] = True
            create_args["onlineMeetingProvider"] = "teamsForBusiness"
        data = _execute_tool(cfg, row, "OUTLOOK_CREATE_ME_EVENT", create_args)
        m.teams_event_id = str(data.get("id") or "").strip()[:255] or m.teams_event_id
        action = "created"
    else:
        update_args: dict[str, Any] = {
            "event_id": m.teams_event_id,
            "subject": subject,
            "start_datetime": start_text,
            "end_datetime": end_text,
            "time_zone": tz,
            "body": {"contentType": "Text", "content": _meeting_body_text(m)},
        }
        if attendees:
            update_args["attendees"] = attendees
        if location_text:
            update_args["location"] = location_text
        data = _execute_tool(cfg, row, "OUTLOOK_UPDATE_CALENDAR_EVENT", update_args)

    now = datetime.datetime.utcnow()
    m.teams_owner_user_id = user.id
    m.teams_calendar_id = (m.teams_calendar_id or "primary")[:255]
    m.teams_sync_status = "linked"
    m.teams_last_synced_at = now
    m.teams_last_local_updated_at = now
    remote_updated = _parse_datetime(str(data.get("lastModifiedDateTime") or "").strip() or None)
    m.teams_last_remote_updated_at = remote_updated or now
    m.teams_etag = (
        str(data.get("@odata.etag") or data.get("changeKey") or "").strip()[:255]
        or m.teams_etag
    )
    if not m.meeting_mode:
        online = data.get("isOnlineMeeting")
        if bool(online):
            m.meeting_mode = "Video"
    db.commit()
    db.refresh(m)
    return action


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


class MeetingCalendarLinkBody(BaseModel):
    teams_event_id: Optional[str] = None
    teams_calendar_id: Optional[str] = None
    teams_sync_status: Optional[str] = None
    teams_etag: Optional[str] = None
    teams_last_remote_updated_at: Optional[str] = None
    teams_last_local_updated_at: Optional[str] = None


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


def _assert_calendar_owner(user: User, m: Meeting) -> None:
    owner_id = getattr(m, "teams_owner_user_id", None)
    if owner_id is not None and owner_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the linked Teams owner can update this meeting calendar link",
        )


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
    sync_state = "skipped"
    try:
        sync_action = _sync_meeting_to_outlook(db, user, m, force_create=True)
        if sync_action:
            sync_state = f"outlook_{sync_action}"
    except HTTPException:
        m.teams_owner_user_id = user.id
        m.teams_sync_status = "sync_error"
        m.teams_last_local_updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(m)
        sync_state = "outlook_sync_error"
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="meeting",
        summary=f"Meeting logged: {m.meeting_title or m.id}",
        project_id=m.project_id,
        resource_id=str(m.id),
        meta={"sync_state": sync_state, "teams_event_id": m.teams_event_id},
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
    if getattr(m, "teams_owner_user_id", None) is not None and m.teams_owner_user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the linked Teams owner can edit this meeting",
        )
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    if "project_id" in data and data["project_id"] is not None:
        assert_project_access(user, db, int(data["project_id"]))
    has_actions = "action_items" in data
    _apply_meeting_body(m, data, skip_action_items=not has_actions)
    m.teams_last_local_updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(m)
    sync_state = "skipped"
    if (m.teams_owner_user_id == user.id) or bool((m.teams_event_id or "").strip()):
        try:
            sync_action = _sync_meeting_to_outlook(db, user, m, force_create=False)
            if sync_action:
                sync_state = f"outlook_{sync_action}"
        except HTTPException:
            m.teams_sync_status = "sync_error"
            db.commit()
            db.refresh(m)
            sync_state = "outlook_sync_error"
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="meeting",
        summary=f"Meeting updated (MTG-{meeting_id})",
        project_id=m.project_id,
        resource_id=str(meeting_id),
        meta={"sync_state": sync_state, "teams_event_id": m.teams_event_id},
    )
    return meeting_to_dict(m)


@router.post("/{meeting_id}/calendar-link")
def link_meeting_calendar(
    meeting_id: int,
    body: MeetingCalendarLinkBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    _assert_calendar_owner(user, m)

    now = datetime.datetime.utcnow()
    requested_event_id = (body.teams_event_id or "").strip()
    m.teams_owner_user_id = m.teams_owner_user_id or user.id
    m.teams_event_id = requested_event_id[:255] or m.teams_event_id
    m.teams_calendar_id = (body.teams_calendar_id or m.teams_calendar_id or "primary").strip()[:255]
    m.teams_sync_status = (body.teams_sync_status or "linked").strip()[:64]
    m.teams_etag = (body.teams_etag or m.teams_etag or "").strip()[:255] or None
    m.teams_last_synced_at = now
    m.teams_last_local_updated_at = _parse_datetime(body.teams_last_local_updated_at) or now
    m.teams_last_remote_updated_at = _parse_datetime(body.teams_last_remote_updated_at)
    db.commit()
    db.refresh(m)
    force_create = not requested_event_id or requested_event_id.startswith(("mtg-", "local-mtg-"))
    sync_state = "skipped"
    try:
        sync_action = _sync_meeting_to_outlook(db, user, m, force_create=force_create)
        if sync_action:
            sync_state = f"outlook_{sync_action}"
    except HTTPException:
        m.teams_sync_status = "sync_error"
        db.commit()
        db.refresh(m)
        sync_state = "outlook_sync_error"
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="meeting_calendar_link",
        summary=f"Meeting linked to Teams calendar (MTG-{meeting_id})",
        project_id=m.project_id,
        resource_id=str(meeting_id),
        meta={
            "teams_event_id": m.teams_event_id,
            "teams_owner_user_id": m.teams_owner_user_id,
            "sync_state": sync_state,
        },
    )
    return meeting_to_dict(m)


@router.patch("/{meeting_id}/calendar-link")
def patch_meeting_calendar_link(
    meeting_id: int,
    body: MeetingCalendarLinkBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    _assert_calendar_owner(user, m)

    if m.teams_owner_user_id is None:
        m.teams_owner_user_id = user.id

    if body.teams_event_id is not None:
        m.teams_event_id = (body.teams_event_id or "").strip()[:255] or None
    if body.teams_calendar_id is not None:
        m.teams_calendar_id = (body.teams_calendar_id or "").strip()[:255] or None
    if body.teams_sync_status is not None:
        m.teams_sync_status = (body.teams_sync_status or "").strip()[:64] or None
    if body.teams_etag is not None:
        m.teams_etag = (body.teams_etag or "").strip()[:255] or None
    if body.teams_last_local_updated_at is not None:
        m.teams_last_local_updated_at = _parse_datetime(body.teams_last_local_updated_at)
    if body.teams_last_remote_updated_at is not None:
        m.teams_last_remote_updated_at = _parse_datetime(body.teams_last_remote_updated_at)
    m.teams_last_synced_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(m)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="meeting_calendar_link",
        summary=f"Meeting calendar link updated (MTG-{meeting_id})",
        project_id=m.project_id,
        resource_id=str(meeting_id),
    )
    return meeting_to_dict(m)


@router.delete("/{meeting_id}/calendar-link")
def unlink_meeting_calendar(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _assert_meeting_access(user, db, m)
    _assert_calendar_owner(user, m)

    m.teams_event_id = None
    m.teams_calendar_id = None
    m.teams_owner_user_id = None
    m.teams_etag = None
    m.teams_sync_status = "not_linked"
    m.teams_last_synced_at = datetime.datetime.utcnow()
    m.teams_last_remote_updated_at = None
    m.teams_last_local_updated_at = None
    db.commit()
    db.refresh(m)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="meeting_calendar_link",
        summary=f"Meeting unlinked from Teams calendar (MTG-{meeting_id})",
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
