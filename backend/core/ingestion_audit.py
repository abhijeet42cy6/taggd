"""Ingestion upload logging — stored in unified activity_log; legacy GET shape preserved."""

from __future__ import annotations

from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..db.database import User
from .activity_log import (
    activity_to_ingestion_event_dict,
    list_ingestion_activity_rows,
    log_activity,
)

_KIND_TO_RESOURCE = {
    "express": "ingestion_express",
    "pro_inspect": "ingestion_pro_inspect",
    "pro_confirm": "ingestion_pro_confirm",
    "sla": "ingestion_sla_upload",
    "wfm": "ingestion_wfm_upload",
    "finance": "ingestion_finance_upload",
    "revenue_trackers": "ingestion_revenue_trackers_upload",
    "vendor_licenses": "ingestion_vendor_licenses_upload",
    "candidates": "ingestion_candidates_upload",
}


def log_ingestion_event(
    db: Session,
    *,
    user: User,
    kind: str,
    filename: str,
    status: str,
    label: str,
    project_id: Optional[int] = None,
) -> None:
    rt = _KIND_TO_RESOURCE.get(kind) or f"ingestion_{kind}"[:64]
    summary = f"{filename or 'file'} — {label}"[:512]
    meta = {
        "ingestion_kind": kind,
        "filename": filename or "",
        "status": status,
        "label": label,
    }
    log_activity(
        db,
        user=user,
        action="upload",
        resource_type=rt,
        summary=summary,
        project_id=project_id,
        resource_id=None,
        meta=meta,
    )


def list_ingestion_events_for_user(db: Session, user: User, limit: int = 50) -> List[dict[str, Any]]:
    """Returns dicts shaped like legacy ingestion events (from activity_log)."""
    rows = list_ingestion_activity_rows(db, user, limit=limit)
    return [activity_to_ingestion_event_dict(r) for r in rows]
