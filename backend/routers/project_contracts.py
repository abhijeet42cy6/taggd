"""CRUD + upload for project-level commercial contract rows (`project_contracts`)."""
from __future__ import annotations

import datetime
import mimetypes
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import Client, Project, ProjectContract, User, get_db

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


ALLOWED_PIPELINE_STAGES = frozenset(
    {
        "discovery",
        "meetings_in_process",
        "terms_settlement",
        "legal_review",
        "signed",
        "active_client",
        "lapsed",
        "cancelled",
    }
)

REALISE_PIPELINE_STAGES = frozenset({"signed", "active_client"})


def _normalize_pipeline_stage(s: Optional[str]) -> Optional[str]:
    if s is None or not str(s).strip():
        return None
    v = str(s).strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {"mom": "meetings_in_process", "meetings": "meetings_in_process"}
    return aliases.get(v, v)


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
    pipeline_stage: Optional[str] = None
    # When project has no client, or only a prospect client: create/rename prospect legal client.
    prospect_client_official_name: Optional[str] = None


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
    pipeline_stage: Optional[str] = None


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
    create_missing_projects: bool = Query(
        False,
        description="If true, create Project rows for Customer names with no directory match (then link contract).",
    ),
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
        result = ingest_contract_workbook_file(
            path, db, user=user, create_missing_projects=create_missing_projects
        )
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
    prospect_name = (payload.pop("prospect_client_official_name", None) or "").strip()
    raw_stage = payload.pop("pipeline_stage", None)
    pipeline_st = _normalize_pipeline_stage(raw_stage)
    if raw_stage is not None and str(raw_stage).strip() and pipeline_st is None:
        raise HTTPException(status_code=400, detail="Invalid pipeline_stage")
    if pipeline_st and pipeline_st not in ALLOWED_PIPELINE_STAGES:
        raise HTTPException(
            status_code=400,
            detail="pipeline_stage must be one of: " + ", ".join(sorted(ALLOWED_PIPELINE_STAGES)),
        )

    if prospect_name:
        if proj.client_id is None:
            nc = Client(official_name=prospect_name[:500], lifecycle_state="prospect")
            db.add(nc)
            db.flush()
            proj.client_id = nc.id
        else:
            oc = db.query(Client).filter(Client.id == proj.client_id).first()
            st = (getattr(oc, "lifecycle_state", None) or "active").lower() if oc else "active"
            if oc and st == "prospect":
                oc.official_name = prospect_name[:500]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Project already linked to an active client. Create a prospect with POST /clients "
                    "(lifecycle_state=prospect) and PATCH /projects/{id} with client_id, then create the contract.",
                )
        db.flush()

    c = ProjectContract(project_id=body.project_id, client_id=proj.client_id)
    c.pipeline_stage = pipeline_st or "discovery"
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
    if "pipeline_stage" in data and data["pipeline_stage"] is not None:
        ps = _normalize_pipeline_stage(data["pipeline_stage"])
        if ps is None or ps not in ALLOWED_PIPELINE_STAGES:
            raise HTTPException(
                status_code=400,
                detail="pipeline_stage must be one of: " + ", ".join(sorted(ALLOWED_PIPELINE_STAGES)),
            )
        data["pipeline_stage"] = ps
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


@router.post("/{contract_id}/realise-client")
def realise_contract_client(
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set linked legal client from prospect → active when pipeline is signed or active_client."""
    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)
    stage = (getattr(c, "pipeline_stage", None) or "").strip().lower()
    if stage not in REALISE_PIPELINE_STAGES:
        raise HTTPException(
            status_code=400,
            detail="Set pipeline_stage to signed or active_client before realising the client.",
        )
    proj = db.query(Project).filter(Project.id == c.project_id).first()
    if not proj or not proj.client_id:
        raise HTTPException(status_code=400, detail="No legal client linked to this project")
    cl = db.query(Client).filter(Client.id == proj.client_id).first()
    if not cl:
        raise HTTPException(status_code=400, detail="Client row missing")
    if (getattr(cl, "lifecycle_state", None) or "active") == "active":
        return {"status": "noop", "client_id": cl.id, "lifecycle_state": "active"}
    cl.lifecycle_state = "active"
    db.commit()
    db.refresh(cl)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="client",
        summary=f"Client realised from contract CNT-{contract_id} (CLI-{cl.id})",
        project_id=c.project_id,
        resource_id=str(cl.id),
        meta={"via_contract_id": contract_id},
    )
    return {"status": "ok", "client_id": cl.id, "lifecycle_state": cl.lifecycle_state}


@router.post("/{contract_id}/upload-msa")
async def upload_msa_document(
    contract_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload and persist an MSA / contract document file for a contract."""
    from backend.core.msa_storage import (
        parse_msa_reference_list,
        save_msa_file,
        serialize_msa_reference_tags,
    )

    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)

    raw = await file.read()
    try:
        filename = save_msa_file(contract_id, raw, file.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    existing = parse_msa_reference_list(c.sow_msa_reference)
    if filename not in existing:
        existing.append(filename)
    c.sow_msa_reference = serialize_msa_reference_tags(existing)
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="upload",
        resource_type="project_contract",
        summary=f"MSA document uploaded for CNT-{contract_id}",
        project_id=c.project_id,
        resource_id=str(contract_id),
        meta={"filename": filename, "count": len(existing)},
    )
    return {"status": "ok", "filename": filename, "sow_msa_reference": c.sow_msa_reference}


@router.get("/{contract_id}/msa-document")
async def serve_msa_document(
    contract_id: int,
    f: Optional[str] = Query(None, description="Stored basename (required when multiple uploads exist for disambiguation)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Serve a stored MSA / contract document. With multiple uploads, pass `f` or the newest file is returned."""
    from backend.core.msa_storage import (
        parse_msa_reference_list,
        pick_latest_msa_filename,
        resolve_msa_path,
    )

    c = db.query(ProjectContract).filter(ProjectContract.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    assert_project_access(user, db, c.project_id)

    ref = (getattr(c, "sow_msa_reference", None) or "").strip()
    filenames = parse_msa_reference_list(ref)
    if not filenames:
        raise HTTPException(
            status_code=404,
            detail="No stored document — upload a file from the Legal tab or set sow_msa_reference to msa: lines.",
        )

    f_q = (f or "").strip()
    if f_q:
        pick = os.path.basename(f_q)
        if pick not in filenames:
            raise HTTPException(status_code=404, detail="Requested file is not attached to this contract")
    else:
        pick = pick_latest_msa_filename(filenames)

    from backend.core.http_file_response import stored_file_response

    mt = mimetypes.guess_type(pick)[0] or "application/octet-stream"
    resp = stored_file_response(
        "msa_documents",
        pick,
        download_name=os.path.basename(pick),
        media_type=mt,
    )
    if resp is None:
        raise HTTPException(status_code=404, detail="Document file not found")
    return resp


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
