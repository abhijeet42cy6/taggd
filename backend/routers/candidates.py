"""CRUD for RPO candidates linked to requisitions (`records`) and projects."""
from __future__ import annotations

import datetime
import math
import os
import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from starlette.responses import FileResponse

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, apply_recruiter_candidate_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.core.candidate_master_mgmt import ensure_master_link_for_candidate
from backend.db.database import Candidate, CandidateMasterLink, Record, User, get_db

router = APIRouter(
    prefix="/candidates",
    tags=["candidates"],
    dependencies=[Depends(require_vertical("candidates"))],
)

_RPO_DATE_FIELDS = frozenset(
    {
        "offer_release_date",
        "expected_doj",
        "actual_doj",
        "selection_date",
        "loi_issue_date",
        "cb_closure_date",
        "offer_date",
        "bgv_date",
        "medical_initiation_date",
    }
)
_INT_FIELDS = frozenset(
    {
        "notice_period_days",
        "excel_row_index",
        "hiring_manager_user_id",
        "assigned_recruiter_user_id",
    }
)
_FLOAT_FIELDS = frozenset(
    {
        "current_ctc_lpa",
        "expected_ctc_lpa",
        "offer_ctc_lpa",
        "total_experience_yrs",
        "offered_gross_ctc",
        "offered_stvs",
        "hike_pct_offered",
    }
)

_CV_ALLOWED_EXT = frozenset({".pdf", ".doc", ".docx"})
_MAX_CV_BYTES = 15 * 1024 * 1024


def _cv_root_dir() -> str:
    env = (os.environ.get("CANDIDATE_CV_ROOT") or "").strip()
    if env:
        return os.path.abspath(env)
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "candidate_cvs")
    )


def _abs_cv_path(storage_key: str) -> Optional[str]:
    if not storage_key or ".." in storage_key:
        return None
    key = storage_key.replace("\\", "/").strip("/")
    parts = [p for p in key.split("/") if p and p != ".."]
    if len(parts) < 2:
        return None
    root = os.path.realpath(_cv_root_dir())
    full = os.path.realpath(os.path.join(root, *parts))
    if not full.startswith(root + os.sep) and full != root:
        return None
    return full if os.path.isfile(full) else None


def _delete_cv_file_if_any(storage_key: Optional[str]) -> None:
    if not storage_key:
        return
    p = _abs_cv_path(storage_key)
    if p:
        try:
            os.remove(p)
        except OSError:
            pass
        try:
            parent = os.path.dirname(p)
            if parent and os.path.isdir(parent) and not os.listdir(parent):
                os.rmdir(parent)
        except OSError:
            pass


def _sanitize_cv_basename(name: str) -> str:
    base = os.path.basename(name or "") or "cv"
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", base)[:120]
    return base or "cv"


def _parse_dt(val: Any) -> Optional[datetime.datetime]:
    if val is None:
        return None
    if isinstance(val, datetime.datetime):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            daypart = s[:10]
            rest = s[10:].lstrip()
            if not rest:
                return datetime.datetime.fromisoformat(daypart + "T00:00:00")
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {val!r}")


def _serialize_candidate(c: Candidate, db: Optional[Session] = None) -> dict[str, Any]:
    def clean(data: Any) -> Any:
        if isinstance(data, dict):
            return {k: clean(v) for k, v in data.items()}
        if isinstance(data, list):
            return [clean(v) for v in data]
        if isinstance(data, float) and (math.isnan(data) or math.isinf(data)):
            return None
        if isinstance(data, (datetime.datetime, datetime.date)):
            return data.isoformat()
        return data

    d = c.__dict__.copy()
    d.pop("_sa_instance_state", None)
    d.pop("created_by_user", None)
    d = clean(d)
    mid: Optional[int] = None
    link = getattr(c, "master_link", None)
    if link is not None:
        mid = link.master_id
    elif db is not None:
        ml = db.query(CandidateMasterLink).filter(CandidateMasterLink.candidate_id == c.id).first()
        if ml is not None:
            mid = ml.master_id
    d["master_id"] = mid
    sk = d.get("cv_storage_key")
    d["has_cv"] = bool(sk and _abs_cv_path(str(sk)))
    d.pop("cv_storage_key", None)
    cb = getattr(c, "created_by_user", None)
    if cb is not None:
        d["created_by_email"] = getattr(cb, "email", None)
    elif d.get("created_by_user_id") and db is not None:
        u = db.query(User).filter(User.id == d["created_by_user_id"]).first()
        d["created_by_email"] = u.email if u else None
    else:
        d["created_by_email"] = None
    exp = d.get("professional_experience_json")
    d["experience_role_count"] = len(exp) if isinstance(exp, list) else 0
    return d


def _assert_candidate_view(db: Session, user: User, c: Candidate) -> None:
    """404 if this mandate row is not visible under the same rules as GET /candidates."""
    q = db.query(Candidate).filter(Candidate.id == c.id)
    q = apply_project_scope(q, user, db, Candidate)
    q = apply_recruiter_candidate_scope(q, user, db)
    if q.first() is None:
        raise HTTPException(status_code=404, detail="Candidate not found")


class CandidateCreateBody(BaseModel):
    project_id: int = Field(..., ge=1)
    record_id: int = Field(..., ge=1)
    client_candidate_id: str = Field(..., min_length=1, max_length=128)
    full_name: Optional[str] = None
    contact_no: Optional[str] = None
    email_id: Optional[str] = None
    gender: Optional[str] = None
    current_location: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    total_experience_yrs: Optional[float] = None
    current_organization: Optional[str] = None
    current_designation: Optional[str] = None
    notice_period_days: Optional[int] = None
    alternate_contact_no: Optional[str] = None
    source_of_hire: Optional[str] = None
    sub_source: Optional[str] = None
    current_ctc_lpa: Optional[float] = None
    expected_ctc_lpa: Optional[float] = None
    resume_screening: Optional[str] = None
    assigned_recruiter: Optional[str] = None
    hiring_manager: Optional[str] = None
    current_stage: Optional[str] = None
    offer_ctc_lpa: Optional[float] = None
    offer_release_date: Optional[str] = None
    offer_acceptance: Optional[str] = None
    expected_doj: Optional[str] = None
    actual_doj: Optional[str] = None
    selection_date: Optional[str] = None
    loi_issue_date: Optional[str] = None
    cb_closure_date: Optional[str] = None
    fingerprint: Optional[str] = None
    excel_row_index: Optional[int] = None
    revenue_results: Optional[dict[str, Any]] = None
    global_status: Optional[str] = None
    candidate_extras: Optional[dict[str, Any]] = None
    offer_date: Optional[str] = None
    offer_accepted_flag: Optional[str] = None
    decline_reason: Optional[str] = None
    joining_status: Optional[str] = None
    checkin_30_day: Optional[str] = None
    checkin_60_day: Optional[str] = None
    checkin_90_day: Optional[str] = None
    early_exit_risk: Optional[str] = None
    offered_gross_ctc: Optional[float] = None
    offered_stvs: Optional[float] = None
    hike_pct_offered: Optional[float] = None
    bgv_date: Optional[str] = None
    bgv_status: Optional[str] = None
    medical_initiation_date: Optional[str] = None
    candidate_staff_no: Optional[str] = None
    msil_staff_no: Optional[str] = None
    sourcer_name: Optional[str] = None
    taggd_pm: Optional[str] = None
    offer_onboarding_extras: Optional[dict[str, Any]] = None
    hiring_manager_user_id: Optional[int] = None
    assigned_recruiter_user_id: Optional[int] = None
    professional_experience_json: Optional[list[dict[str, Any]]] = None
    professional_summary: Optional[str] = Field(None, max_length=32_000)


class CandidatePatchBody(BaseModel):
    full_name: Optional[str] = None
    contact_no: Optional[str] = None
    email_id: Optional[str] = None
    gender: Optional[str] = None
    current_location: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    total_experience_yrs: Optional[float] = None
    current_organization: Optional[str] = None
    current_designation: Optional[str] = None
    notice_period_days: Optional[int] = None
    alternate_contact_no: Optional[str] = None
    source_of_hire: Optional[str] = None
    sub_source: Optional[str] = None
    current_ctc_lpa: Optional[float] = None
    expected_ctc_lpa: Optional[float] = None
    resume_screening: Optional[str] = None
    assigned_recruiter: Optional[str] = None
    hiring_manager: Optional[str] = None
    current_stage: Optional[str] = None
    offer_ctc_lpa: Optional[float] = None
    offer_release_date: Optional[str] = None
    offer_acceptance: Optional[str] = None
    expected_doj: Optional[str] = None
    actual_doj: Optional[str] = None
    selection_date: Optional[str] = None
    loi_issue_date: Optional[str] = None
    cb_closure_date: Optional[str] = None
    fingerprint: Optional[str] = None
    excel_row_index: Optional[int] = None
    revenue_results: Optional[dict[str, Any]] = None
    global_status: Optional[str] = None
    candidate_extras: Optional[dict[str, Any]] = None
    offer_date: Optional[str] = None
    offer_accepted_flag: Optional[str] = None
    decline_reason: Optional[str] = None
    joining_status: Optional[str] = None
    checkin_30_day: Optional[str] = None
    checkin_60_day: Optional[str] = None
    checkin_90_day: Optional[str] = None
    early_exit_risk: Optional[str] = None
    offered_gross_ctc: Optional[float] = None
    offered_stvs: Optional[float] = None
    hike_pct_offered: Optional[float] = None
    bgv_date: Optional[str] = None
    bgv_status: Optional[str] = None
    medical_initiation_date: Optional[str] = None
    candidate_staff_no: Optional[str] = None
    msil_staff_no: Optional[str] = None
    sourcer_name: Optional[str] = None
    taggd_pm: Optional[str] = None
    offer_onboarding_extras: Optional[dict[str, Any]] = None
    record_id: Optional[int] = Field(None, ge=1)
    hiring_manager_user_id: Optional[int] = None
    assigned_recruiter_user_id: Optional[int] = None
    professional_experience_json: Optional[list[dict[str, Any]]] = None
    professional_summary: Optional[str] = Field(None, max_length=32_000)


def _body_to_candidate_dict(body: CandidateCreateBody | CandidatePatchBody, *, is_create: bool) -> dict[str, Any]:
    raw = body.model_dump() if is_create else body.model_dump(exclude_unset=True)
    raw.pop("project_id", None)
    raw.pop("record_id", None)
    raw.pop("client_candidate_id", None)
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if v is None:
            continue
        if k in _RPO_DATE_FIELDS:
            out[k] = _parse_dt(v)
        elif k in _INT_FIELDS:
            out[k] = int(v)
        elif k in _FLOAT_FIELDS:
            out[k] = float(v)
        elif k in ("candidate_extras", "offer_onboarding_extras", "revenue_results"):
            out[k] = v
        elif k == "professional_experience_json":
            out[k] = v
        elif k == "professional_summary" and isinstance(v, str):
            out[k] = v.strip() or None
        elif isinstance(v, str):
            out[k] = v.strip() or None
        else:
            out[k] = v
    return out


def _apply_patch(c: Candidate, patch: dict[str, Any]) -> None:
    for k, v in patch.items():
        if k == "record_id":
            continue
        if k in ("candidate_extras", "offer_onboarding_extras") and v is not None:
            base = dict(getattr(c, k) or {}) if isinstance(getattr(c, k), dict) else {}
            if not isinstance(v, dict):
                raise HTTPException(status_code=400, detail=f"{k} must be an object")
            setattr(c, k, {**base, **v})
        elif k == "revenue_results" and v is not None:
            base = dict(c.revenue_results or {}) if isinstance(c.revenue_results, dict) else {}
            if not isinstance(v, dict):
                raise HTTPException(status_code=400, detail="revenue_results must be an object")
            c.revenue_results = {**base, **v}
        elif k == "professional_experience_json" and v is not None:
            if not isinstance(v, list):
                raise HTTPException(status_code=400, detail="professional_experience_json must be an array")
            setattr(c, k, v)
        else:
            setattr(c, k, v)


@router.get("")
def list_candidates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project_id: Optional[int] = Query(None),
    record_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, description="Matches name, email, or client candidate id (substring)"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    q = db.query(Candidate)
    q = apply_project_scope(q, user, db, Candidate)
    q = apply_recruiter_candidate_scope(q, user, db)
    if search and str(search).strip():
        term = f"%{str(search).strip()}%"
        q = q.filter(
            or_(
                Candidate.full_name.ilike(term),
                Candidate.email_id.ilike(term),
                Candidate.client_candidate_id.ilike(term),
                Candidate.current_organization.ilike(term),
                Candidate.professional_summary.ilike(term),
            )
        )
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(Candidate.project_id == project_id)
    if record_id is not None:
        rec = db.query(Record).filter(Record.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Requisition not found")
        assert_project_access(user, db, rec.project_id)
        q = q.filter(Candidate.record_id == record_id)
    total = q.count()
    rows = (
        q.options(joinedload(Candidate.master_link), joinedload(Candidate.created_by_user))
        .order_by(Candidate.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": [_serialize_candidate(x, db) for x in rows], "total": total, "limit": limit, "offset": offset}


@router.post("/parse-resume")
async def parse_resume_preview(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
):
    """Extract text from PDF/DOCX and return best-effort field suggestions for candidate autofill."""
    from backend.core.resume_parse import extract_resume_text, parse_resume_text

    orig = file.filename or "cv.pdf"
    ext = os.path.splitext(orig)[1].lower() or ".pdf"
    if ext not in _CV_ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type {ext!r}; allowed: {', '.join(sorted(_CV_ALLOWED_EXT))}",
        )
    data = await file.read()
    if len(data) > _MAX_CV_BYTES:
        raise HTTPException(status_code=413, detail=f"CV exceeds {_MAX_CV_BYTES // (1024 * 1024)} MiB limit")
    try:
        text = extract_resume_text(orig, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}") from e
    fields = parse_resume_text(text)
    return {"ok": True, "fields": fields}


@router.get("/{candidate_id}/cv")
def download_candidate_cv(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import mimetypes

    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)
    if not c.cv_storage_key:
        raise HTTPException(status_code=404, detail="No CV on file for this candidate")
    path = _abs_cv_path(c.cv_storage_key)
    if not path:
        raise HTTPException(status_code=404, detail="CV file missing on server")
    media, _ = mimetypes.guess_type(c.cv_original_filename or path)
    return FileResponse(
        path,
        media_type=media or "application/octet-stream",
        filename=c.cv_original_filename or os.path.basename(path),
    )


@router.post("/{candidate_id}/cv")
async def upload_candidate_cv(
    candidate_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)

    orig = file.filename or "cv.pdf"
    ext = os.path.splitext(orig)[1].lower() or ".pdf"
    if ext not in _CV_ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type {ext!r}; allowed: {', '.join(sorted(_CV_ALLOWED_EXT))}",
        )

    root = _cv_root_dir()
    os.makedirs(root, exist_ok=True)
    sub = os.path.join(root, str(c.id))
    os.makedirs(sub, exist_ok=True)
    new_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(sub, new_name)
    rel_key = f"{c.id}/{new_name}".replace("\\", "/")

    old_key = c.cv_storage_key
    size = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_CV_BYTES:
                    try:
                        os.remove(dest)
                    except OSError:
                        pass
                    raise HTTPException(status_code=413, detail=f"CV exceeds {_MAX_CV_BYTES // (1024 * 1024)} MiB limit")
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        try:
            os.remove(dest)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"Could not save CV: {e}") from e

    c.cv_storage_key = rel_key
    c.cv_original_filename = _sanitize_cv_basename(orig)
    db.commit()
    db.refresh(c)
    _delete_cv_file_if_any(old_key)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate",
        summary=f"Candidate #{c.id} CV uploaded — {c.cv_original_filename}",
        project_id=c.project_id,
        resource_id=str(c.id),
        meta={"cv_bytes": size},
    )
    return _serialize_candidate(c, db)


@router.delete("/{candidate_id}/cv")
def delete_candidate_cv(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)
    old = c.cv_storage_key
    c.cv_storage_key = None
    c.cv_original_filename = None
    db.commit()
    db.refresh(c)
    _delete_cv_file_if_any(old)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate",
        summary=f"Candidate #{c.id} CV removed",
        project_id=c.project_id,
        resource_id=str(c.id),
    )
    return _serialize_candidate(c, db)


@router.get("/{candidate_id}")
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = (
        db.query(Candidate)
        .options(joinedload(Candidate.master_link), joinedload(Candidate.created_by_user))
        .filter(Candidate.id == candidate_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)
    return _serialize_candidate(c, db)


@router.post("")
def create_candidate(
    body: CandidateCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    rec = db.query(Record).filter(Record.id == body.record_id).first()
    if not rec or rec.project_id != body.project_id:
        raise HTTPException(status_code=400, detail="record_id must belong to the same project_id")

    exists = (
        db.query(Candidate)
        .filter(
            Candidate.project_id == body.project_id,
            Candidate.client_candidate_id == body.client_candidate_id.strip(),
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="client_candidate_id already exists for this project")

    data = _body_to_candidate_dict(body, is_create=True)
    rev = data.pop("revenue_results", None) or {}
    c = Candidate(
        project_id=body.project_id,
        record_id=body.record_id,
        client_candidate_id=body.client_candidate_id.strip(),
        revenue_results=rev,
        created_by_user_id=user.id,
        **data,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    ensure_master_link_for_candidate(db, c)
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="candidate",
        summary=f"Candidate {c.client_candidate_id} — {(c.full_name or '')[:60]}",
        project_id=c.project_id,
        resource_id=str(c.id),
        meta={"record_id": c.record_id},
    )
    return _serialize_candidate(c, db)


@router.patch("/{candidate_id}")
def patch_candidate(
    candidate_id: int,
    body: CandidatePatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)

    def _validate_user_fk(uid: Optional[int]) -> None:
        if uid is None:
            return
        if not db.query(User).filter(User.id == uid, User.is_active.is_(True)).first():
            raise HTTPException(status_code=400, detail=f"Invalid or inactive user id: {uid}")

    patch_raw = body.model_dump(exclude_unset=True)
    if patch_raw.get("record_id") is not None:
        rec = db.query(Record).filter(Record.id == patch_raw["record_id"]).first()
        if not rec or rec.project_id != c.project_id:
            raise HTTPException(status_code=400, detail="record_id must belong to the same project")
        c.record_id = patch_raw["record_id"]

    typed = _body_to_candidate_dict(body, is_create=False)
    if "hiring_manager_user_id" in patch_raw:
        _validate_user_fk(patch_raw.get("hiring_manager_user_id"))
    if "assigned_recruiter_user_id" in patch_raw:
        _validate_user_fk(patch_raw.get("assigned_recruiter_user_id"))
    _apply_patch(c, typed)

    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="candidate",
        summary=f"Candidate #{c.id} updated — {c.client_candidate_id}",
        project_id=c.project_id,
        resource_id=str(c.id),
    )
    return _serialize_candidate(c, db)


@router.delete("/{candidate_id}")
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    _assert_candidate_view(db, user, c)
    pid, cid, label = c.project_id, c.id, c.client_candidate_id
    _delete_cv_file_if_any(c.cv_storage_key)
    db.delete(c)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="candidate",
        summary=f"Candidate #{cid} deleted — {label}",
        project_id=pid,
        resource_id=str(cid),
    )
    return {"status": "deleted", "id": cid}
