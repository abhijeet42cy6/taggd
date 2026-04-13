"""CRUD + upload for project-level commercial contract rows (`project_contracts`)."""
from __future__ import annotations

import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import Project, ProjectContract, User, get_db

router = APIRouter(
    prefix="/contracts",
    tags=["contracts"],
    dependencies=[Depends(require_vertical("contracts"))],
)


def _contract_to_dict(c: ProjectContract) -> dict[str, Any]:
    def dval(v):
        if isinstance(v, (datetime.date, datetime.datetime)):
            return v.isoformat()
        return v

    out: dict[str, Any] = {}
    for col in ProjectContract.__table__.columns:
        out[col.name] = dval(getattr(c, col.name, None))
    return out


class ProjectContractCreate(BaseModel):
    project_id: int = Field(..., ge=1)
    customer_name: Optional[str] = None
    account_type: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    renewal_reminder_date: Optional[str] = None
    duration_months: Optional[int] = None
    signed_acv_inr: Optional[float] = None
    contract_status: Optional[str] = None
    signed_cm_pct: Optional[float] = None
    headcount_contracted: Optional[float] = None
    hiring_volume: Optional[float] = None
    taggd_source_mix: Optional[str] = None
    other_source_mix: Optional[str] = None
    overall_rph: Optional[float] = None
    mmf_applicable: Optional[bool] = None
    opening_fee_applicable: Optional[bool] = None
    payment_terms: Optional[str] = None
    pricing_model: Optional[str] = None
    contract_detail: Optional[str] = None
    remarks: Optional[str] = None
    agreed_rate_fee_inr: Optional[float] = None
    est_annual_value_inr: Optional[float] = None
    sow_msa_reference: Optional[str] = None
    sla_terms_summary: Optional[str] = None
    positions_contracted: Optional[int] = None
    positions_filled: Optional[int] = None
    renewal_status: Optional[str] = None
    reason_for_lapse: Optional[str] = None
    client_signoff_authority: Optional[str] = None
    internal_signoff: Optional[str] = None
    revenue_run_rate_inr: Optional[float] = None
    practice_head_snapshot: Optional[str] = None


class ProjectContractPatch(BaseModel):
    customer_name: Optional[str] = None
    account_type: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    renewal_reminder_date: Optional[str] = None
    duration_months: Optional[int] = None
    signed_acv_inr: Optional[float] = None
    contract_status: Optional[str] = None
    signed_cm_pct: Optional[float] = None
    headcount_contracted: Optional[float] = None
    hiring_volume: Optional[float] = None
    taggd_source_mix: Optional[str] = None
    other_source_mix: Optional[str] = None
    overall_rph: Optional[float] = None
    mmf_applicable: Optional[bool] = None
    opening_fee_applicable: Optional[bool] = None
    payment_terms: Optional[str] = None
    pricing_model: Optional[str] = None
    contract_detail: Optional[str] = None
    remarks: Optional[str] = None
    agreed_rate_fee_inr: Optional[float] = None
    est_annual_value_inr: Optional[float] = None
    sow_msa_reference: Optional[str] = None
    sla_terms_summary: Optional[str] = None
    positions_contracted: Optional[int] = None
    positions_filled: Optional[int] = None
    renewal_status: Optional[str] = None
    reason_for_lapse: Optional[str] = None
    client_signoff_authority: Optional[str] = None
    internal_signoff: Optional[str] = None
    revenue_run_rate_inr: Optional[float] = None
    practice_head_snapshot: Optional[str] = None


def _parse_date(s: Optional[str]) -> Optional[datetime.date]:
    if s is None or not str(s).strip():
        return None
    t = str(s).strip()[:10]
    try:
        return datetime.date.fromisoformat(t)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s!r} (use YYYY-MM-DD)")


def _apply_contract_fields(target: ProjectContract, data: dict) -> None:
    date_fields = (
        "contract_start_date",
        "contract_end_date",
        "renewal_reminder_date",
    )
    for k, v in data.items():
        if v is None and k not in ("mmf_applicable", "opening_fee_applicable"):
            continue
        if k in date_fields:
            setattr(target, k, _parse_date(v) if v else None)
        elif hasattr(target, k):
            setattr(target, k, v)


@router.get("/by-project/{project_id}")
def list_contracts_for_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    rows = (
        db.query(ProjectContract)
        .filter(ProjectContract.project_id == project_id)
        .order_by(ProjectContract.id.desc())
        .all()
    )
    return [_contract_to_dict(r) for r in rows]


@router.get("")
def list_all_contracts_scoped(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = apply_project_scope(db.query(ProjectContract), user, db, ProjectContract)
    rows = q.order_by(ProjectContract.id.desc()).limit(2000).all()
    return [_contract_to_dict(r) for r in rows]


@router.post("/upload")
async def upload_contract_workbook(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from tempfile import NamedTemporaryFile
    import shutil
    import os

    from backend.scripts.ingest_project_contracts import ingest_contract_workbook_file

    suffix = os.path.splitext(file.filename or "")[1] or ".xlsx"
    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        path = tmp.name
    try:
        result = ingest_contract_workbook_file(path, db, user=user)
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


@router.get("/{contract_id}")
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)
    return _contract_to_dict(c)


@router.post("")
def create_contract(
    body: ProjectContractCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        payload = body.model_dump(exclude_unset=True)
    except AttributeError:
        payload = body.dict(exclude_unset=True)
    payload.pop("project_id", None)
    c = ProjectContract(project_id=body.project_id, client_id=proj.client_id)
    _apply_contract_fields(c, payload)
    db.add(c)
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="project_contract",
        summary=f"Contract created for PRJ-{body.project_id}",
        project_id=body.project_id,
        resource_id=str(c.id),
    )
    return _contract_to_dict(c)


@router.patch("/{contract_id}")
def patch_contract(
    contract_id: int,
    body: ProjectContractPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    _apply_contract_fields(c, data)
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="project_contract",
        summary=f"Contract updated (CNT-{contract_id})",
        project_id=c.project_id,
        resource_id=str(contract_id),
    )
    return _contract_to_dict(c)


@router.delete("/{contract_id}")
def delete_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)
    pid = c.project_id
    db.delete(c)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="project_contract",
        summary=f"Contract deleted (CNT-{contract_id})",
        project_id=pid,
        resource_id=str(contract_id),
    )
    return {"status": "ok", "id": contract_id}
