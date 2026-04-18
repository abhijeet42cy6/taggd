"""Project onboarding / transition tracker (one row per project, scoped by assignments)."""
from __future__ import annotations

import datetime
import mimetypes
import os
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.auth.verticals import require_vertical
from backend.core.activity_log import log_activity
from backend.db.database import Project, ProjectTransition, User, get_db

router = APIRouter(
    prefix="/transitions",
    tags=["transitions"],
    dependencies=[Depends(require_vertical("transitions"))],
)

STATUSES = frozenset({"draft", "in_progress", "soft_launched", "live", "delayed", "cancelled"})


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


def _effective_dead_days(row: ProjectTransition) -> Optional[int]:
    if row.dead_days is not None:
        return row.dead_days
    if row.go_live_date and row.project_signed_date:
        return (row.go_live_date - row.project_signed_date).days
    return None


def _effective_ageing_days(row: ProjectTransition, today: datetime.date) -> Optional[int]:
    if row.ageing_days is not None:
        return row.ageing_days
    if row.go_live_date:
        return 0
    anchor = row.kickoff_date or row.project_signed_date
    if anchor:
        return (today - anchor).days
    return None


def _attachment_filename(entry: Any) -> Optional[str]:
    if isinstance(entry, dict):
        fn = entry.get("filename")
        return str(fn).strip() if fn else None
    return None


def _normalize_attachments(v: Any) -> list[dict[str, Any]]:
    if not v or not isinstance(v, list):
        return []
    out: list[dict[str, Any]] = []
    for x in v:
        if isinstance(x, dict) and x.get("filename"):
            out.append(
                {
                    "filename": str(x["filename"]).strip(),
                    "original_name": str(x.get("original_name") or x["filename"]).strip()[:240],
                    "uploaded_at": str(x.get("uploaded_at") or "")[:40],
                }
            )
    return out


def transition_to_dict(row: ProjectTransition, *, today: datetime.date) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row.id,
        "project_id": row.project_id,
        "status": row.status,
        "project_signed_date": _date_out(row.project_signed_date),
        "kickoff_date": _date_out(row.kickoff_date),
        "as_is_study_date": _date_out(row.as_is_study_date),
        "to_be_presentation_date": _date_out(row.to_be_presentation_date),
        "soft_launch_date": _date_out(row.soft_launch_date),
        "go_live_date": _date_out(row.go_live_date),
        "transition_done_by_user_id": row.transition_done_by_user_id,
        "attendees_internal": row.attendees_internal,
        "attendees_external": row.attendees_external,
        "external_attendees_names": row.external_attendees_names,
        "external_attendees_contact": row.external_attendees_contact,
        "external_attendees_email": row.external_attendees_email,
        "rpo_solution_deck_url": row.rpo_solution_deck_url,
        "transition_document_url": row.transition_document_url,
        "dead_days": row.dead_days,
        "ageing_days": row.ageing_days,
        "dead_days_effective": _effective_dead_days(row),
        "ageing_days_effective": _effective_ageing_days(row, today),
        "reason_for_delay": row.reason_for_delay,
        "linked_meeting_ids_json": row.linked_meeting_ids_json,
        "resource_attachments_json": getattr(row, "resource_attachments_json", None),
        "created_by_user_id": row.created_by_user_id,
        "updated_by_user_id": row.updated_by_user_id,
        "system_created_at": row.system_created_at.isoformat() if row.system_created_at else None,
        "system_updated_at": row.system_updated_at.isoformat() if row.system_updated_at else None,
    }
    return out


class TransitionCreate(BaseModel):
    project_id: int = Field(..., ge=1)
    status: Optional[str] = "draft"


class TransitionPatch(BaseModel):
    status: Optional[str] = None
    project_signed_date: Optional[str] = None
    kickoff_date: Optional[str] = None
    as_is_study_date: Optional[str] = None
    to_be_presentation_date: Optional[str] = None
    soft_launch_date: Optional[str] = None
    go_live_date: Optional[str] = None
    transition_done_by_user_id: Optional[int] = None
    attendees_internal: Optional[str] = None
    attendees_external: Optional[str] = None
    external_attendees_names: Optional[str] = None
    external_attendees_contact: Optional[str] = None
    external_attendees_email: Optional[str] = None
    rpo_solution_deck_url: Optional[str] = None
    transition_document_url: Optional[str] = None
    dead_days: Optional[int] = None
    ageing_days: Optional[int] = None
    reason_for_delay: Optional[str] = None
    linked_meeting_ids_json: Optional[List[int]] = None
    resource_attachments_json: Optional[List[dict[str, Any]]] = None


def _get_or_none(db: Session, project_id: int) -> Optional[ProjectTransition]:
    return db.query(ProjectTransition).filter(ProjectTransition.project_id == project_id).first()


@router.get("")
def list_transitions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = datetime.date.today()
    q = db.query(ProjectTransition)
    q = apply_project_scope(q, user, db, ProjectTransition)
    rows = q.order_by(ProjectTransition.id.desc()).limit(2000).all()
    # enrich with project label
    out = []
    for r in rows:
        d = transition_to_dict(r, today=today)
        p = db.query(Project).filter(Project.id == r.project_id).first()
        d["account_name"] = p.account_name if p else None
        d["engagement_name"] = p.engagement_name if p else None
        out.append(d)
    return out


@router.get("/by-project/{project_id}")
def get_transition_for_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    row = _get_or_none(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="No transition record for this project")
    today = datetime.date.today()
    d = transition_to_dict(row, today=today)
    p = db.query(Project).filter(Project.id == project_id).first()
    d["account_name"] = p.account_name if p else None
    d["engagement_name"] = p.engagement_name if p else None
    return d


@router.post("")
def create_transition(
    body: TransitionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    if not db.query(Project).filter(Project.id == body.project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")
    if _get_or_none(db, body.project_id):
        raise HTTPException(status_code=400, detail="Transition already exists for this project")
    st = (body.status or "draft").strip().lower()
    if st not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status (use {sorted(STATUSES)})")
    row = ProjectTransition(
        project_id=body.project_id,
        status=st,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="transition",
        summary=f"Transition tracker started for project {body.project_id}",
        project_id=body.project_id,
        resource_id=str(row.id),
    )
    today = datetime.date.today()
    return transition_to_dict(row, today=today)


@router.post("/by-project/{project_id}/upload-resource")
async def upload_transition_resource(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save a file under `transition_documents/` and append metadata to the transition row (creates draft row if missing)."""
    from backend.core.transition_storage import save_transition_file

    assert_project_access(user, db, project_id)
    if not db.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(status_code=404, detail="Project not found")

    raw = await file.read()
    try:
        stored_name = save_transition_file(project_id, raw, file.filename or "document")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    row = _get_or_none(db, project_id)
    if not row:
        row = ProjectTransition(
            project_id=project_id,
            status="draft",
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
            resource_attachments_json=[],
        )
        db.add(row)
        db.flush()

    attachments = row.resource_attachments_json or []
    if not isinstance(attachments, list):
        attachments = []
    entry = {
        "filename": stored_name,
        "original_name": (file.filename or stored_name)[:240],
        "uploaded_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    attachments = [*attachments, entry]
    row.resource_attachments_json = attachments
    row.updated_by_user_id = user.id
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="upload",
        resource_type="transition",
        summary=f"Transition resource uploaded for PRJ-{project_id}",
        project_id=project_id,
        resource_id=str(row.id),
        meta={"filename": stored_name},
    )
    today = datetime.date.today()
    return {"attachment": entry, "transition": transition_to_dict(row, today=today)}


@router.get("/by-project/{project_id}/resource-file/{filename}")
def download_transition_resource(
    project_id: int,
    filename: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from backend.core.transition_storage import resolve_transition_path

    assert_project_access(user, db, project_id)
    row = _get_or_none(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="No transition record for this project")

    att = getattr(row, "resource_attachments_json", None) or []
    if not isinstance(att, list):
        att = []
    allowed = {_attachment_filename(x) for x in att}
    allowed.discard(None)
    safe = os.path.basename(filename)
    if safe != filename.replace("\\", "/").rsplit("/", 1)[-1] or safe not in allowed:
        raise HTTPException(status_code=404, detail="File not found for this transition")

    path = resolve_transition_path(safe)
    if not path:
        raise HTTPException(status_code=404, detail="File missing on server")

    mt = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    orig = next(
        (str(x.get("original_name") or safe) for x in att if isinstance(x, dict) and _attachment_filename(x) == safe),
        safe,
    )
    return FileResponse(path, media_type=mt, filename=os.path.basename(orig))


@router.patch("/by-project/{project_id}")
def patch_transition(
    project_id: int,
    body: TransitionPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    row = _get_or_none(db, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="No transition record for this project")
    raw = body.model_dump(exclude_unset=True)
    date_fields = {
        "project_signed_date",
        "kickoff_date",
        "as_is_study_date",
        "to_be_presentation_date",
        "soft_launch_date",
        "go_live_date",
    }
    if "status" in raw and raw["status"] is not None:
        st = str(raw["status"]).strip().lower()
        if st not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = st
    for k, v in raw.items():
        if k == "status":
            continue
        if k in date_fields:
            setattr(row, k, _parse_date(v) if v else None)
        elif k == "linked_meeting_ids_json":
            row.linked_meeting_ids_json = v
        elif k == "resource_attachments_json":
            from backend.core.transition_storage import try_delete_file

            new_norm = _normalize_attachments(v)
            old = row.resource_attachments_json or []
            if not isinstance(old, list):
                old = []
            old_fns = {_attachment_filename(x) for x in old}
            old_fns.discard(None)
            new_fns = {_attachment_filename(x) for x in new_norm}
            new_fns.discard(None)
            for fn in old_fns - new_fns:
                try_delete_file(fn)
            row.resource_attachments_json = new_norm or None
        elif k == "transition_done_by_user_id":
            if v is not None:
                u = db.query(User).filter(User.id == int(v)).first()
                if not u:
                    raise HTTPException(status_code=400, detail="transition_done_by_user_id not found")
            row.transition_done_by_user_id = v
        elif hasattr(row, k):
            setattr(row, k, v)
    row.updated_by_user_id = user.id
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="transition",
        summary=f"Transition updated for project {project_id}",
        project_id=project_id,
        resource_id=str(row.id),
    )
    today = datetime.date.today()
    return transition_to_dict(row, today=today)
