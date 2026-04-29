"""Composio integration endpoints (per-user Microsoft connection flow)."""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from typing import Any, Optional
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.verticals import require_vertical
from backend.core.activity_log import log_activity
from backend.core.composio_config import ComposioConfig, build_composio_user_id, load_composio_config
from backend.db.database import Meeting, User, UserComposioConnection, get_db

router = APIRouter(prefix="/integrations/composio", tags=["integrations"])

STATE_TTL_SECONDS = 10 * 60


class ComposioConnectBody(BaseModel):
    connection_id: Optional[str] = Field(default=None, max_length=255)
    external_user_id: Optional[str] = Field(default=None, max_length=255)
    connection_meta_json: Optional[dict[str, Any]] = None


class OutlookSyncBody(BaseModel):
    limit: int = Field(default=25, ge=1, le=200)
    include_past: bool = True


def _connection_dict(row: Optional[UserComposioConnection]) -> Optional[dict[str, Any]]:
    if not row:
        return None
    return {
        "id": row.id,
        "provider": row.provider,
        "status": row.status,
        "connection_id": row.connection_id,
        "external_user_id": row.external_user_id,
        "connection_meta_json": row.connection_meta_json if isinstance(row.connection_meta_json, dict) else None,
        "connected_at": row.connected_at.isoformat() if row.connected_at else None,
        "disconnected_at": row.disconnected_at.isoformat() if row.disconnected_at else None,
        "system_updated_at": row.system_updated_at.isoformat() if row.system_updated_at else None,
    }


def _status_payload(user: User, row: Optional[UserComposioConnection]) -> dict[str, Any]:
    cfg = load_composio_config()
    connected = bool(
        row
        and row.status == "connected"
        and row.disconnected_at is None
        and str(row.connection_id or "").startswith("ca_")
    )
    return {
        "enabled": True,
        "configured": cfg.configured,
        "env": cfg.env,
        "base_url": cfg.base_url,
        "auth_config_id": cfg.auth_config_id,
        "connected": connected,
        "user_id": user.id,
        "connection": _connection_dict(row),
    }


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


def _state_secret() -> str:
    return (
        (os.getenv("COMPOSIO_STATE_SECRET") or "").strip()
        or (os.getenv("JWT_SECRET") or "").strip()
        or "revagent-composio-dev-secret"
    )


def _urlsafe_b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _urlsafe_b64_decode(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("utf-8"))


def _sign_state(encoded_payload: str) -> str:
    return hmac.new(_state_secret().encode("utf-8"), encoded_payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _create_state_token(user_id: int) -> str:
    payload = {
        "uid": int(user_id),
        "iat": int(time.time()),
        "nonce": uuid.uuid4().hex,
    }
    encoded = _urlsafe_b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _sign_state(encoded)
    return f"{encoded}.{sig}"


def _verify_state_token(token: str) -> dict[str, Any]:
    try:
        encoded, sig = token.split(".", 1)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid callback state token") from e
    expected = _sign_state(encoded)
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid callback state signature")
    try:
        payload = json.loads(_urlsafe_b64_decode(encoded).decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Malformed callback state payload") from e
    iat = int(payload.get("iat") or 0)
    if iat <= 0 or (int(time.time()) - iat) > STATE_TTL_SECONDS:
        raise HTTPException(status_code=401, detail="Expired callback state token")
    uid = int(payload.get("uid") or 0)
    if uid <= 0:
        raise HTTPException(status_code=400, detail="Invalid callback user mapping")
    return payload


def _resolve_auth_config_id(cfg: ComposioConfig) -> str:
    if cfg.auth_config_id:
        return cfg.auth_config_id
    try:
        r = requests.get(
            f"{cfg.base_url}/api/v3/auth_configs",
            headers={"x-api-key": cfg.api_key or ""},
            params={"toolkit_slug": "OUTLOOK", "show_disabled": "false", "limit": 10},
            timeout=20,
        )
        data = r.json() if r.content else {}
        if 200 <= r.status_code < 300:
            items = data.get("items") if isinstance(data, dict) else None
            if isinstance(items, list):
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    cand = (
                        it.get("id")
                        or it.get("auth_config_id")
                        or it.get("authConfigId")
                        or (it.get("auth_config") or {}).get("id")
                    )
                    if cand:
                        return str(cand)
    except Exception:
        pass
    raise HTTPException(
        status_code=503,
        detail="No OUTLOOK auth config found. Set COMPOSIO_OUTLOOK_AUTH_CONFIG_ID in .env.",
    )


def _extract_redirect_url(body: dict[str, Any]) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    candidates = [
        body.get("redirect_url"),
        body.get("redirect_uri"),
        body.get("redirectUrl"),
        ((body.get("connectionData") or {}).get("val") or {}).get("redirectUrl"),
        ((body.get("connection_data") or {}).get("val") or {}).get("redirectUrl"),
    ]
    for c in candidates:
        if isinstance(c, str) and c.strip():
            return c.strip()
    return None


def _extract_event_items(payload: Any) -> list[dict[str, Any]]:
    """Best-effort extraction from Composio OUTLOOK_LIST_EVENTS response."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("items", "events", "value", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
            if isinstance(val, dict):
                nested = _extract_event_items(val)
                if nested:
                    return nested
    return []


def _extract_datetime_text(value: Any) -> Optional[str]:
    if isinstance(value, str):
        s = value.strip()
        return s or None
    if isinstance(value, dict):
        for k in ("dateTime", "datetime", "date_time"):
            raw = value.get(k)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
    return None


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    # Microsoft Graph ticks-format: YYYY-MM-DDTHH:MM:SS.fffffff (7 digits) — trim to 6 for Python.
    raw = re.sub(r"(\.\d{6})\d+", r"\1", raw)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.datetime.fromisoformat(raw)
    except ValueError:
        return None


def _time_hhmm(dt: Optional[datetime.datetime]) -> Optional[str]:
    if not dt:
        return None
    return dt.strftime("%H:%M")


def _meeting_dict(m: Meeting) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in Meeting.__table__.columns:
        v = getattr(m, col.name, None)
        if isinstance(v, datetime.datetime):
            out[col.name] = v.isoformat()
        elif isinstance(v, datetime.date):
            out[col.name] = v.isoformat()
        else:
            out[col.name] = v
    out["action_items"] = []
    return out


def _resolve_event_title(ev: dict[str, Any]) -> str:
    for k in ("subject", "title", "name"):
        raw = ev.get(k)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()[:512]
    return "Outlook meeting"


def _event_response_status(ev: dict[str, Any]) -> str:
    rs = ev.get("responseStatus")
    if isinstance(rs, dict):
        raw = rs.get("response")
        if isinstance(raw, str):
            return raw.strip().lower()
    return ""


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


def _refresh_connection_from_remote_if_needed(
    db: Session,
    cfg: ComposioConfig,
    row: Optional[UserComposioConnection],
) -> Optional[UserComposioConnection]:
    if not row or not str(row.connection_id or "").startswith("ca_"):
        return row
    remote = _fetch_connected_account(cfg, str(row.connection_id or ""))
    if not remote:
        return row
    remote_status = _normalize_connection_status(remote.get("status") or (remote.get("data") or {}).get("status"))
    changed = False
    if remote_status == "connected" and (row.status != "connected" or row.disconnected_at is not None):
        row.status = "connected"
        row.disconnected_at = None
        row.connected_at = row.connected_at or datetime.datetime.utcnow()
        changed = True
    elif remote_status == "failed" and row.status == "connected":
        row.status = "failed"
        row.disconnected_at = datetime.datetime.utcnow()
        changed = True

    remote_user_id = remote.get("user_id")
    if isinstance(remote_user_id, str) and remote_user_id.strip() and row.external_user_id != remote_user_id.strip():
        row.external_user_id = remote_user_id.strip()[:255]
        changed = True

    if changed:
        db.commit()
        db.refresh(row)
    return row


@router.get("/status")
def composio_status(
    _guard: None = Depends(require_vertical("meetings")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cfg = load_composio_config()
    row = _latest_connection(db, user.id)
    row = _refresh_connection_from_remote_if_needed(db, cfg, row)
    return _status_payload(user, row)


@router.post("/connect-link")
def composio_connect_link(
    request: Request,
    _guard: None = Depends(require_vertical("meetings")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cfg = load_composio_config()
    if not cfg.configured:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY is not configured on the server.")
    auth_config_id = _resolve_auth_config_id(cfg)
    connection_user_id = build_composio_user_id(cfg, email=user.email, user_id=user.id)
    state = _create_state_token(user.id)
    callback_base = (cfg.public_base_url or str(request.base_url).rstrip("/")).rstrip("/")
    callback_url = f"{callback_base}/integrations/composio/callback?{urlencode({'state': state})}"

    payload = {
        "auth_config": {"id": auth_config_id},
        "connection": {
            "user_id": connection_user_id,
            "callback_url": callback_url,
        },
    }
    try:
        r = requests.post(
            f"{cfg.base_url}/api/v3.1/connected_accounts",
            headers={"x-api-key": cfg.api_key or "", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to create Composio connection request: {e}") from e

    body = r.json() if r.content else {}
    if not (200 <= r.status_code < 300):
        detail = body.get("error", {}).get("message") if isinstance(body, dict) else None
        raise HTTPException(status_code=502, detail=detail or f"Composio error ({r.status_code})")

    redirect_url = _extract_redirect_url(body)
    if not redirect_url:
        raise HTTPException(status_code=502, detail="Composio did not return a redirect URL")
    connection_id = str((body or {}).get("id") or "").strip() or None

    now = datetime.datetime.utcnow()
    row = _latest_connection(db, user.id)
    if not row:
        row = UserComposioConnection(user_id=user.id, provider="microsoft")
        db.add(row)
    row.status = "initiated"
    row.connection_id = connection_id or row.connection_id
    row.external_user_id = connection_user_id
    row.connection_meta_json = {
        "auth_config_id": auth_config_id,
        "callback_url": callback_url,
        "requested_at": now.isoformat(),
    }
    row.connected_at = row.connected_at or now
    row.disconnected_at = None
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="composio_connection",
        summary="Microsoft calendar connection initiated",
        resource_id=str(row.id),
        project_id=None,
        meta={"provider": "microsoft", "status": row.status, "auth_config_id": auth_config_id},
    )
    return {
        "redirect_url": redirect_url,
        "connection_id": connection_id,
        "connection_user_id": connection_user_id,
        "auth_config_id": auth_config_id,
    }


@router.get("/callback", response_class=HTMLResponse)
def composio_callback(
    request: Request,
    state: str,
    status: Optional[str] = None,
    connected_account_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db),
):
    payload = _verify_state_token(state)
    user_id = int(payload["uid"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found for callback")

    row = _latest_connection(db, user.id)
    if not row:
        row = UserComposioConnection(user_id=user.id, provider="microsoft")
        db.add(row)

    now = datetime.datetime.utcnow()
    qp = request.query_params
    resolved_connection_id = (
        connected_account_id
        or connection_id
        or qp.get("connectedAccountId")
        or qp.get("connected_account")
        or qp.get("id")
        or row.connection_id
    )
    resolved_status = status or qp.get("connection_status") or qp.get("state_status")
    normalized = _normalize_connection_status(resolved_status)

    cfg = load_composio_config()
    remote: Optional[dict[str, Any]] = None
    if resolved_connection_id and str(resolved_connection_id).startswith("ca_"):
        remote = _fetch_connected_account(cfg, str(resolved_connection_id))
        if remote and normalized != "connected":
            normalized = _normalize_connection_status(
                remote.get("status") or (remote.get("data") or {}).get("status")
            )

    if normalized == "connected" and resolved_connection_id:
        row.status = "connected"
        row.connection_id = str(resolved_connection_id).strip()[:255]
        row.connected_at = now
        row.disconnected_at = None
    elif normalized == "failed":
        row.status = "failed"
        row.disconnected_at = now
    else:
        # Unknown callback shape: keep initiated/pending state instead of false-failing.
        row.status = row.status or "initiated"
        row.disconnected_at = None

    meta = row.connection_meta_json if isinstance(row.connection_meta_json, dict) else {}
    meta.update(
        {
            "callback_status": status,
            "callback_status_resolved": normalized,
            "callback_error": error,
            "callback_error_description": error_description,
            "callback_connected_account_id": str(resolved_connection_id or "")[:255] or None,
            "callback_query": dict(qp),
            "callback_received_at": now.isoformat(),
        }
    )
    remote_user_id = remote.get("user_id") if isinstance(remote, dict) else None
    if isinstance(remote_user_id, str) and remote_user_id.strip():
        row.external_user_id = remote_user_id.strip()[:255]
    row.connection_meta_json = meta
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="composio_connection",
        summary=(
            "Microsoft calendar connection completed"
            if row.status == "connected"
            else "Microsoft calendar connection failed"
        ),
        resource_id=str(row.id),
        project_id=None,
        meta={"provider": "microsoft", "status": row.status, "connection_id": row.connection_id},
    )

    msg = {
        "type": "composio-connect-result",
        "status": row.status,
        "connected_account_id": row.connection_id,
        "platform_user_id": user.id,
    }
    html = f"""<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Composio Connection</title></head>
  <body style="font-family: Arial, sans-serif; padding: 18px;">
    <h3>{'Connection complete' if row.status == 'connected' else 'Connection failed'}</h3>
    <p>You can close this window.</p>
    <script>
      (function() {{
        try {{
          if (window.opener) {{
            window.opener.postMessage({json.dumps(msg)}, "*");
          }}
        }} catch (e) {{}}
        setTimeout(function() {{ window.close(); }}, 120);
      }})();
    </script>
  </body>
</html>"""
    return HTMLResponse(content=html)


@router.post("/connect")
def composio_connect(
    body: ComposioConnectBody,
    _guard: None = Depends(require_vertical("meetings")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manual fallback for externally completed OAuth flows."""
    cfg = load_composio_config()
    if not cfg.configured:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY is not configured on the server.")
    now = datetime.datetime.utcnow()
    row = _latest_connection(db, user.id)
    if not row:
        row = UserComposioConnection(user_id=user.id, provider="microsoft")
        db.add(row)

    row.status = "connected"
    row.connection_id = (body.connection_id or row.connection_id or "").strip()[:255] or row.connection_id
    row.external_user_id = (
        body.external_user_id
        or row.external_user_id
        or build_composio_user_id(cfg, email=user.email, user_id=user.id)
    )
    row.external_user_id = (row.external_user_id or "").strip()[:255] or None
    row.connection_meta_json = body.connection_meta_json if isinstance(body.connection_meta_json, dict) else row.connection_meta_json
    row.connected_at = now
    row.disconnected_at = None
    db.commit()
    db.refresh(row)

    log_activity(
        db,
        user=user,
        action="update",
        resource_type="composio_connection",
        summary="Microsoft calendar integration connected",
        resource_id=str(row.id),
        project_id=None,
        meta={"provider": "microsoft", "status": row.status},
    )
    return _status_payload(user, row)


@router.post("/disconnect")
def composio_disconnect(
    _guard: None = Depends(require_vertical("meetings")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _latest_connection(db, user.id)
    if row:
        row.status = "disconnected"
        row.disconnected_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(row)
        log_activity(
            db,
            user=user,
            action="update",
            resource_type="composio_connection",
            summary="Microsoft calendar integration disconnected",
            resource_id=str(row.id),
            project_id=None,
            meta={"provider": "microsoft", "status": row.status},
        )
    return _status_payload(user, row)


@router.post("/outlook/sync")
def composio_sync_outlook_meetings(
    body: OutlookSyncBody,
    _guard: None = Depends(require_vertical("meetings")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cfg = load_composio_config()
    if not cfg.configured:
        raise HTTPException(status_code=503, detail="COMPOSIO_API_KEY is not configured on the server.")
    row = _latest_connection(db, user.id)
    row = _refresh_connection_from_remote_if_needed(db, cfg, row)
    if not row or row.status != "connected" or not str(row.connection_id or "").startswith("ca_"):
        raise HTTPException(status_code=400, detail="Microsoft calendar is not connected.")

    connection_user_id = (
        row.external_user_id
        or build_composio_user_id(cfg, email=user.email, user_id=user.id)
    ).strip()
    execute_payload = {
        "connected_account_id": row.connection_id,
        "user_id": connection_user_id,
        "arguments": {
            "top": body.limit,
            "select": [
                "id",
                "subject",
                "start",
                "end",
                "organizer",
                "responseStatus",
                "isCancelled",
                "lastModifiedDateTime",
                "onlineMeeting",
                "location",
                "attendees",
                "bodyPreview",
            ],
            "orderby": ["start/dateTime desc"],
        },
    }
    try:
        r = requests.post(
            f"{cfg.base_url}/api/v3.1/tools/execute/OUTLOOK_LIST_EVENTS",
            headers={"x-api-key": cfg.api_key or "", "Content-Type": "application/json"},
            json=execute_payload,
            timeout=45,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Outlook events: {e}") from e

    data = r.json() if r.content else {}
    if not (200 <= r.status_code < 300):
        detail = None
        if isinstance(data, dict):
            detail = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else data.get("error")
        raise HTTPException(status_code=502, detail=detail or f"Composio error ({r.status_code})")
    if not isinstance(data, dict) or not bool(data.get("successful", True)):
        err = data.get("error") if isinstance(data, dict) else None
        raise HTTPException(status_code=502, detail=str(err or "Outlook sync failed"))

    now = datetime.datetime.utcnow()
    events = _extract_event_items(data.get("data"))
    if not events:
        return {"imported": 0, "updated": 0, "meetings": [], "remote_count": 0}

    imported = 0
    updated = 0
    touched: list[Meeting] = []
    for ev in events:
        if bool(ev.get("isCancelled")):
            continue
        response_status = _event_response_status(ev)
        if response_status == "declined":
            # Skip mail invites the user has explicitly declined.
            continue
        event_id = str(ev.get("id") or "").strip()
        if not event_id:
            continue
        start_dt = _parse_iso_datetime(_extract_datetime_text(ev.get("start")))
        end_dt = _parse_iso_datetime(_extract_datetime_text(ev.get("end")))
        if not body.include_past:
            ref_dt = end_dt or start_dt
            if ref_dt and ref_dt < now:
                continue
        remote_updated_at = _parse_iso_datetime(
            str(ev.get("lastModifiedDateTime") or ev.get("last_modified_date_time") or "").strip() or None
        )
        organizer = ev.get("organizer") if isinstance(ev.get("organizer"), dict) else {}
        email_info = organizer.get("emailAddress") if isinstance(organizer.get("emailAddress"), dict) else {}
        organizer_email = (
            (email_info.get("address") if isinstance(email_info, dict) else None)
            or (organizer.get("address") if isinstance(organizer, dict) else None)
            or user.email
        )
        organizer_name = (
            (email_info.get("name") if isinstance(email_info, dict) else None)
            or (organizer.get("name") if isinstance(organizer, dict) else None)
            or organizer_email
            or "Unknown organizer"
        )
        calendar_id = (
            str(ev.get("calendar_id") or "").strip()
            or str((ev.get("calendar") or {}).get("id") if isinstance(ev.get("calendar"), dict) else "").strip()
            or "primary"
        )
        join_url = None
        online_meeting = ev.get("onlineMeeting") if isinstance(ev.get("onlineMeeting"), dict) else {}
        if isinstance(online_meeting, dict):
            raw_join = online_meeting.get("joinUrl")
            if isinstance(raw_join, str) and raw_join.strip():
                join_url = raw_join.strip()

        meeting = (
            db.query(Meeting)
            .filter(
                Meeting.teams_event_id == event_id,
                Meeting.teams_owner_user_id == user.id,
            )
            .first()
        )
        is_new = meeting is None
        if is_new:
            meeting = Meeting(
                created_by_user_id=user.id,
                created_by_email=user.email,
                organizer_user_id=user.id,
            )
            db.add(meeting)

        meeting.meeting_title = _resolve_event_title(ev)
        if start_dt:
            meeting.meeting_date = start_dt.date()
            meeting.start_time = _time_hhmm(start_dt)
        if end_dt:
            meeting.end_time = _time_hhmm(end_dt)
        meeting.organizer_name = str(organizer_name)[:255]

        organizer_pu = None
        if isinstance(organizer_email, str) and "@" in organizer_email:
            organizer_pu = (
                db.query(User)
                .filter(User.email == organizer_email.strip().lower())
                .first()
            )
        if organizer_pu:
            meeting.organizer_user_id = organizer_pu.id
        elif is_new:
            meeting.organizer_user_id = user.id

        attendees_raw = ev.get("attendees") if isinstance(ev.get("attendees"), list) else []
        internal_emails: list[str] = []
        external_emails: list[str] = []
        external_records: list[dict[str, Any]] = []
        seen_internal: set[str] = set()
        seen_external: set[str] = set()
        for att in attendees_raw:
            if not isinstance(att, dict):
                continue
            email_obj = att.get("emailAddress") if isinstance(att.get("emailAddress"), dict) else {}
            addr_raw = (email_obj.get("address") if isinstance(email_obj, dict) else None) or ""
            addr = str(addr_raw).strip().lower()
            display = (email_obj.get("name") if isinstance(email_obj, dict) else None) or addr_raw
            if not addr:
                continue
            pu = db.query(User).filter(User.email == addr).first()
            if pu:
                if pu.email and pu.email.lower() not in seen_internal:
                    seen_internal.add(pu.email.lower())
                    internal_emails.append(pu.email)
            else:
                if addr not in seen_external:
                    seen_external.add(addr)
                    external_emails.append(addr_raw)
                    external_records.append(
                        {
                            "name": str(display).strip()[:255] or addr_raw,
                            "designation": "",
                            "email": addr_raw,
                            "phone": "",
                        }
                    )

        if internal_emails or external_records:
            meeting.attendees_internal = (", ".join(internal_emails) or None)
            meeting.attendees_external = (", ".join(external_emails) or None)
            meeting.external_attendees_json = external_records or None
        else:
            # Outlook returned no attendees field; do not wipe existing local data.
            pass

        meeting.teams_event_id = event_id
        meeting.teams_calendar_id = calendar_id[:255]
        meeting.teams_owner_user_id = user.id
        meeting.teams_sync_status = "linked"
        meeting.teams_last_synced_at = now
        meeting.teams_last_remote_updated_at = remote_updated_at or now
        meeting.teams_last_local_updated_at = meeting.teams_last_local_updated_at or now
        if bool(ev.get("isCancelled")):
            meeting.meeting_status = "Cancelled"
        else:
            meeting.meeting_status = meeting.meeting_status or "Scheduled"
        if join_url:
            meeting.mom_link_remarks = join_url[:500]
            meeting.meeting_mode = meeting.meeting_mode or "Video"

        if is_new:
            imported += 1
        else:
            updated += 1
        touched.append(meeting)

    db.commit()
    for m in touched:
        db.refresh(m)
    return {
        "imported": imported,
        "updated": updated,
        "remote_count": len(events),
        "meetings": [_meeting_dict(m) for m in touched],
    }


@router.post("/webhook")
async def composio_webhook(
    request: Request,
):
    cfg = load_composio_config()
    raw = await request.body()
    secret = cfg.webhook_secret
    if secret:
        sent = (
            request.headers.get("x-composio-signature")
            or request.headers.get("x-composio-webhook-secret")
            or ""
        ).strip()
        digest = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        accepted = {secret, digest, f"sha256={digest}"}
        if sent not in accepted:
            raise HTTPException(status_code=401, detail="Invalid Composio webhook signature")

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}") from e

    event_type = str(payload.get("type") or payload.get("event") or "unknown")
    return {"status": "accepted", "event_type": event_type}
