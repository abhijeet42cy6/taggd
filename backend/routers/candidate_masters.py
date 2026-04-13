"""Enterprise candidate store: `candidate_masters` + links, scoped search, admin backfill."""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user, is_platform_admin, require_roles
from backend.auth.verticals import require_vertical
from backend.core.activity_log import log_activity
from backend.core.candidate_master_mgmt import (
    LINK_SOURCE_MANUAL,
    backfill_candidate_masters,
    ensure_master_link_for_candidate,
    visible_candidate_ids_query,
)
from backend.db.database import Candidate, CandidateMaster, CandidateMasterLink, User, get_db

router = APIRouter(
    prefix="/candidate-masters",
    tags=["candidate-masters"],
    dependencies=[Depends(require_vertical("candidates"))],
)


def _serialize_master_light(m: CandidateMaster, placement_count: int) -> dict[str, Any]:
    return {
        "id": m.id,
        "display_name": m.display_name,
        "email_normalized": m.email_normalized,
        "phone_normalized": m.phone_normalized,
        "global_fingerprint": m.global_fingerprint,
        "consent_json": m.consent_json,
        "meta_json": m.meta_json,
        "migration_batch_tag": m.migration_batch_tag,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        "placement_count": placement_count,
    }


def _serialize_candidate_row(c: Candidate) -> dict[str, Any]:
    return {
        "id": c.id,
        "project_id": c.project_id,
        "record_id": c.record_id,
        "client_candidate_id": c.client_candidate_id,
        "full_name": c.full_name,
        "email_id": c.email_id,
        "current_stage": c.current_stage,
        "global_status": c.global_status,
        "assigned_recruiter_user_id": c.assigned_recruiter_user_id,
        "hiring_manager_user_id": c.hiring_manager_user_id,
    }


class BackfillBody(BaseModel):
    dry_run: bool = False
    limit: Optional[int] = Field(None, ge=1, le=50_000)
    migration_batch_tag: str = Field("v1", max_length=64)


class ManualLinkBody(BaseModel):
    candidate_id: int = Field(..., ge=1)


@router.get("")
def list_candidate_masters(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    q: Optional[str] = Query(None, description="Search display name, email, phone (normalized prefix)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=50_000),
):
    """Talent directory: masters that have at least one visible mandate row for this user."""
    vis = visible_candidate_ids_query(db, user).subquery()
    mid_subq = (
        db.query(CandidateMasterLink.master_id.label("mid"))
        .filter(CandidateMasterLink.candidate_id.in_(select(vis.c.id)))
        .distinct()
        .subquery()
    )
    base = db.query(CandidateMaster).filter(CandidateMaster.id.in_(select(mid_subq.c.mid)))
    if q and str(q).strip():
        term = f"%{str(q).strip().lower()}%"
        base = base.filter(
            (CandidateMaster.display_name.ilike(term))
            | (CandidateMaster.email_normalized.ilike(term))
            | (CandidateMaster.phone_normalized.ilike(term))
            | (CandidateMaster.global_fingerprint.ilike(term))
        )
    total = base.count()
    rows = base.order_by(CandidateMaster.id.desc()).offset(offset).limit(limit).all()
    out: List[dict[str, Any]] = []
    for m in rows:
        n = (
            db.query(CandidateMasterLink)
            .filter(
                CandidateMasterLink.master_id == m.id,
                CandidateMasterLink.candidate_id.in_(select(vis.c.id)),
            )
            .count()
        )
        out.append(_serialize_master_light(m, n))
    return {"items": out, "total": total, "limit": limit, "offset": offset}


@router.get("/{master_id}")
def get_candidate_master(
    master_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(CandidateMaster).filter(CandidateMaster.id == master_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Candidate master not found")
    vis = visible_candidate_ids_query(db, user).subquery()
    placements = (
        db.query(Candidate)
        .join(CandidateMasterLink, CandidateMasterLink.candidate_id == Candidate.id)
        .filter(CandidateMasterLink.master_id == master_id, Candidate.id.in_(select(vis.c.id)))
        .order_by(Candidate.id.desc())
        .all()
    )
    if not placements and not is_platform_admin(user):
        raise HTTPException(status_code=404, detail="Candidate master not found")
    if not placements and is_platform_admin(user):
        placements = (
            db.query(Candidate)
            .join(CandidateMasterLink, CandidateMasterLink.candidate_id == Candidate.id)
            .filter(CandidateMasterLink.master_id == master_id)
            .order_by(Candidate.id.desc())
            .limit(500)
            .all()
        )
    d = _serialize_master_light(m, len(placements))
    d["placements"] = [_serialize_candidate_row(c) for c in placements]
    return d


@router.post("/backfill", dependencies=[Depends(require_roles("admin", "platform_admin"))])
def post_backfill_candidate_masters(
    body: BackfillBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Idempotent migration: link unlinked mandate rows to masters (admin only)."""
    stats = backfill_candidate_masters(
        db,
        migration_batch_tag=body.migration_batch_tag.strip() or "v1",
        dry_run=body.dry_run,
        limit=body.limit,
    )
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate_master_backfill",
        summary=f"Candidate master backfill batch={body.migration_batch_tag!r} dry_run={body.dry_run}",
        project_id=None,
        resource_id=None,
        meta=stats,
    )
    return stats


@router.post("/{master_id}/link-candidate", dependencies=[Depends(require_roles("admin", "platform_admin"))])
def post_manual_link_candidate(
    master_id: int,
    body: ManualLinkBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attach a mandate row to a master (admin); re-points link if already linked elsewhere."""
    m = db.query(CandidateMaster).filter(CandidateMaster.id == master_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Master not found")
    c = db.query(Candidate).filter(Candidate.id == body.candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    existing = db.query(CandidateMasterLink).filter(CandidateMasterLink.candidate_id == c.id).first()
    if existing:
        if existing.master_id == master_id:
            return {"status": "unchanged", "master_id": master_id, "candidate_id": c.id}
        db.delete(existing)
        db.flush()
    link = CandidateMasterLink(
        master_id=master_id,
        candidate_id=c.id,
        link_source=LINK_SOURCE_MANUAL,
        confidence=1.0,
        notes="manual_admin",
    )
    db.add(link)
    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate_master_link",
        summary=f"Manual link master {master_id} → candidate {c.id}",
        project_id=c.project_id,
        resource_id=str(master_id),
    )
    return {"status": "linked", "master_id": master_id, "candidate_id": c.id}


@router.post("/ensure-link/{candidate_id}", dependencies=[Depends(require_roles("admin", "platform_admin"))])
def post_ensure_link(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create master+link for one candidate if missing (admin)."""
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    link = ensure_master_link_for_candidate(db, c, link_source=LINK_SOURCE_MANUAL)
    db.commit()
    db.refresh(link)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate_master_link",
        summary=f"Ensured master link for candidate {candidate_id}",
        project_id=c.project_id,
        resource_id=str(link.master_id),
    )
    return {"master_id": link.master_id, "candidate_id": candidate_id, "link_id": link.id}
