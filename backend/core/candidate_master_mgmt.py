"""Enterprise candidate masters: normalize identity, link mandate rows, idempotent backfill."""

from __future__ import annotations

import hashlib
from typing import Optional

from sqlalchemy.orm import Session

from backend.auth.scope import apply_project_scope, apply_recruiter_candidate_scope
from backend.db.database import Candidate, CandidateMaster, CandidateMasterLink, User

LINK_SOURCE_MIGRATION = "migration"
LINK_SOURCE_AUTO = "auto"
LINK_SOURCE_MANUAL = "manual"


def normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
    s = str(value).strip().lower()
    if "@" not in s:
        return None
    return s[:255]


def normalize_phone(value: Optional[str]) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
    digits = "".join(c for c in str(value) if c.isdigit())
    if len(digits) < 8:
        return None
    return digits[-15:]


def compose_global_fingerprint(
    email_n: Optional[str],
    phone_n: Optional[str],
    display: str,
) -> Optional[str]:
    """Stable hash for dedupe hints; collisions possible — use with confidence scores."""
    parts = [email_n or "", phone_n or "", (display or "").strip().lower()[:200]]
    if not any(parts):
        return None
    raw = "|".join(parts).encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()[:48]


def _find_master_by_identity(
    db: Session,
    *,
    email_n: Optional[str],
    phone_n: Optional[str],
) -> Optional[CandidateMaster]:
    if email_n:
        m = db.query(CandidateMaster).filter(CandidateMaster.email_normalized == email_n).order_by(CandidateMaster.id).first()
        if m:
            return m
    if phone_n:
        m = db.query(CandidateMaster).filter(CandidateMaster.phone_normalized == phone_n).order_by(CandidateMaster.id).first()
        if m:
            return m
    return None


def ensure_master_link_for_candidate(
    db: Session,
    candidate: Candidate,
    *,
    link_source: str = LINK_SOURCE_AUTO,
    migration_batch_tag: Optional[str] = None,
) -> Optional[CandidateMasterLink]:
    """Create master + link if missing. Idempotent. Caller commits."""
    existing = db.query(CandidateMasterLink).filter(CandidateMasterLink.candidate_id == candidate.id).first()
    if existing:
        return existing

    email_n = normalize_email(getattr(candidate, "email_id", None))
    phone_n = normalize_phone(getattr(candidate, "contact_no", None)) or normalize_phone(
        getattr(candidate, "alternate_contact_no", None)
    )
    display = (getattr(candidate, "full_name", None) or "").strip() or (candidate.client_candidate_id or "").strip() or "Unknown"
    fp = compose_global_fingerprint(email_n, phone_n, display)

    master = _find_master_by_identity(db, email_n=email_n, phone_n=phone_n)
    confidence = 0.55
    if master:
        if email_n and master.email_normalized == email_n:
            confidence = 0.92
        elif phone_n and master.phone_normalized == phone_n:
            confidence = 0.78
    else:
        master = CandidateMaster(
            display_name=display[:512],
            email_normalized=email_n,
            phone_normalized=phone_n,
            global_fingerprint=fp,
            migration_batch_tag=migration_batch_tag,
        )
        db.add(master)
        db.flush()
        confidence = 0.99

    link = CandidateMasterLink(
        master_id=master.id,
        candidate_id=candidate.id,
        link_source=link_source,
        confidence=confidence,
        notes=None,
    )
    db.add(link)
    db.flush()
    return link


def backfill_candidate_masters(
    db: Session,
    *,
    migration_batch_tag: str = "v1",
    dry_run: bool = False,
    limit: Optional[int] = None,
) -> dict[str, Any]:
    """
    Link every unlinked `candidates` row to a `candidate_masters` row.
    Idempotent: skips candidates that already have `candidate_master_links`.
    """
    linked_rows = db.query(CandidateMasterLink.candidate_id).all()
    linked_ids = {r[0] for r in linked_rows}
    q = db.query(Candidate).order_by(Candidate.id.asc())
    if limit is not None:
        q = q.limit(limit)
    candidates = [c for c in q.all() if c.id not in linked_ids]

    created_masters = 0
    new_links = 0
    reused_masters = 0

    for c in candidates:
        email_n = normalize_email(getattr(c, "email_id", None))
        phone_n = normalize_phone(getattr(c, "contact_no", None)) or normalize_phone(
            getattr(c, "alternate_contact_no", None)
        )
        display = (getattr(c, "full_name", None) or "").strip() or (c.client_candidate_id or "").strip() or "Unknown"
        fp = compose_global_fingerprint(email_n, phone_n, display)

        master = _find_master_by_identity(db, email_n=email_n, phone_n=phone_n)
        if master:
            reused_masters += 1
            conf = 0.92 if (email_n and master.email_normalized == email_n) else 0.78
        else:
            if dry_run:
                created_masters += 1
                new_links += 1
                continue
            master = CandidateMaster(
                display_name=display[:512],
                email_normalized=email_n,
                phone_normalized=phone_n,
                global_fingerprint=fp,
                migration_batch_tag=migration_batch_tag,
            )
            db.add(master)
            db.flush()
            created_masters += 1
            conf = 0.99

        if dry_run:
            new_links += 1
            continue

        link = CandidateMasterLink(
            master_id=master.id,
            candidate_id=c.id,
            link_source=LINK_SOURCE_MIGRATION,
            confidence=conf,
            notes=None,
        )
        db.add(link)
        new_links += 1

    if not dry_run:
        db.commit()

    return {
        "candidates_processed": len(candidates),
        "masters_created": created_masters,
        "links_created": new_links,
        "masters_reused": reused_masters,
        "dry_run": dry_run,
        "migration_batch_tag": migration_batch_tag,
    }


def visible_candidate_ids_query(db: Session, user: User):
    """Query of `Candidate.id` rows the user may see (same rules as `GET /candidates`)."""
    cq = db.query(Candidate.id)
    cq = apply_project_scope(cq, user, db, Candidate)
    cq = apply_recruiter_candidate_scope(cq, user, db)
    return cq
