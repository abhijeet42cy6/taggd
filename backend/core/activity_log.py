"""Unified activity log: write + scoped list for GET /activity/log."""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth.profile import ROLE_PLATFORM_ADMIN, ROLE_RECRUITER, resolve_user_profile
from ..db.database import ActivityLog, User, UserProjectAssignment


def log_activity(
    db: Session,
    *,
    user: User,
    action: str,
    resource_type: str,
    summary: str,
    project_id: Optional[int] = None,
    resource_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    try:
        row = ActivityLog(
            user_id=user.id,
            actor_email=(user.email or "")[:255] or None,
            action=action[:32],
            resource_type=resource_type[:64],
            resource_id=(resource_id or "")[:128] or None,
            project_id=project_id,
            summary=summary[:512],
            meta_json=meta if meta else None,
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        logging.exception("activity_log insert failed")


def _scoped_activity_query(db: Session, user: User):
    q = db.query(ActivityLog).order_by(ActivityLog.created_at.desc())
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        return q.filter(ActivityLog.user_id == user.id)
    profile = resolve_user_profile(u, db)
    srole = (u.role or "").strip().lower()
    if profile.effective_role == ROLE_PLATFORM_ADMIN or srole == "admin":
        return q
    if profile.effective_role == ROLE_RECRUITER:
        return q.filter(ActivityLog.user_id == user.id)

    pids = [
        r[0]
        for r in db.query(UserProjectAssignment.project_id)
        .filter(UserProjectAssignment.user_id == user.id)
        .all()
    ]
    if not pids:
        return q.filter(ActivityLog.user_id == user.id)

    return q.filter(
        or_(
            ActivityLog.user_id == user.id,
            and_(ActivityLog.project_id.isnot(None), ActivityLog.project_id.in_(pids)),
        )
    )


def list_activity_for_user(
    db: Session, user: User, *, limit: int = 50, offset: int = 0
) -> tuple[List[ActivityLog], int]:
    base = _scoped_activity_query(db, user)
    total = base.count()
    rows = base.offset(offset).limit(limit).all()
    return rows, total


def list_ingestion_activity_rows(db: Session, user: User, limit: int = 50) -> List[ActivityLog]:
    """Ingestion-only feed: scoped + resource_type in ingestion set."""
    q = _scoped_activity_query(db, user).filter(ActivityLog.resource_type.in_(INGESTION_RESOURCE_TYPES))
    return q.limit(limit).all()


def activity_log_to_dict(row: ActivityLog) -> dict[str, Any]:
    meta = row.meta_json if isinstance(row.meta_json, dict) else {}
    return {
        "id": row.id,
        "public_id": f"ACT-{row.id:06d}",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "actor_email": row.actor_email or "",
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id or "",
        "project_id": row.project_id,
        "summary": row.summary,
        "meta": meta,
    }


def activity_to_ingestion_event_dict(row: ActivityLog) -> dict[str, Any]:
    """Shape compatible with legacy GET /ingestion/events for ingestion-only types."""
    meta = row.meta_json if isinstance(row.meta_json, dict) else {}
    return {
        "id": row.id,
        "public_id": f"ING-{row.id:05d}",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "actor_email": row.actor_email or "",
        "kind": meta.get("ingestion_kind") or row.resource_type,
        "filename": meta.get("filename") or "",
        "status": meta.get("status") or "",
        "label": meta.get("label") or row.summary[:255],
        "project_id": row.project_id,
    }


INGESTION_RESOURCE_TYPES = frozenset(
    {
        "ingestion_express",
        "ingestion_pro_inspect",
        "ingestion_pro_confirm",
        "ingestion_sla_upload",
        "ingestion_wfm_upload",
        "ingestion_finance_upload",
    }
)
