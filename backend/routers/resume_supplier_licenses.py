"""CRUD for org-level resume supplier / job board license costs (no project linkage)."""
from __future__ import annotations

import datetime
import os
import tempfile
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.core.activity_log import log_activity
from backend.core.ingestion_audit import log_ingestion_event
from backend.core.resume_supply_chain_tracker_xlsx import ingest_workbook
from backend.db.database import ResumeSupplierLicense, User, get_db

router = APIRouter(
    prefix="/vendor-licenses",
    tags=["vendor-licenses"],
    dependencies=[Depends(require_vertical("vendor_licenses"))],
)


def _parse_date(s: Optional[str]) -> Optional[datetime.date]:
    if s is None or not str(s).strip():
        return None
    t = str(s).strip()[:10]
    try:
        return datetime.date.fromisoformat(t)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s!r} (use YYYY-MM-DD)")


def _row_to_dict(r: ResumeSupplierLicense) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in ResumeSupplierLicense.__table__.columns:
        v = getattr(r, col.name, None)
        if isinstance(v, datetime.date) and not isinstance(v, datetime.datetime):
            out[col.name] = v.isoformat()
        elif isinstance(v, datetime.datetime):
            out[col.name] = v.isoformat()
        else:
            out[col.name] = v
    return out


class ResumeSupplierLicenseCreate(BaseModel):
    vendor_name: str = Field(..., min_length=1, max_length=512)
    login_ids_count: Optional[int] = None
    resume_inventory: Optional[str] = None
    job_postings: Optional[int] = None
    naukri_invites: Optional[int] = None
    utilization: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    contract_duration_months: Optional[int] = None
    cost_inr: Optional[float] = None
    primary_person_name: Optional[str] = None
    primary_person_phone: Optional[str] = None
    primary_person_email: Optional[str] = None
    secondary_person_name: Optional[str] = None
    secondary_person_phone: Optional[str] = None
    secondary_person_email: Optional[str] = None
    remarks: Optional[str] = None
    fiscal_year_label: Optional[str] = None
    sort_order: int = 0


class ResumeSupplierLicensePatch(BaseModel):
    vendor_name: Optional[str] = Field(None, min_length=1, max_length=512)
    login_ids_count: Optional[int] = None
    resume_inventory: Optional[str] = None
    job_postings: Optional[int] = None
    naukri_invites: Optional[int] = None
    utilization: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    contract_duration_months: Optional[int] = None
    cost_inr: Optional[float] = None
    primary_person_name: Optional[str] = None
    primary_person_phone: Optional[str] = None
    primary_person_email: Optional[str] = None
    secondary_person_name: Optional[str] = None
    secondary_person_phone: Optional[str] = None
    secondary_person_email: Optional[str] = None
    remarks: Optional[str] = None
    fiscal_year_label: Optional[str] = None
    sort_order: Optional[int] = None


_LICENSE_COLS = {c.name for c in ResumeSupplierLicense.__table__.columns}


def _apply_payload(target: ResumeSupplierLicense, data: dict[str, Any]) -> None:
    dates = ("start_date", "end_date")
    for k, v in data.items():
        if k not in _LICENSE_COLS:
            continue
        if k in dates:
            setattr(target, k, _parse_date(v) if v else None)
        else:
            setattr(target, k, v)


@router.get("")
def list_vendor_licenses(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    rows = (
        db.query(ResumeSupplierLicense)
        .order_by(ResumeSupplierLicense.sort_order.asc(), ResumeSupplierLicense.id.asc())
        .limit(5000)
        .all()
    )
    return [_row_to_dict(r) for r in rows]


@router.post("/ingest-upload")
async def ingest_vendor_licenses_workbook(
    file: UploadFile = File(...),
    replace_fy: bool = Query(False, description="Delete all DB rows for the workbook FY, then load."),
    dry_run: bool = Query(False, description="Parse and validate only; do not commit."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload *Resume Supply Chain Partner* / *Job Board Tracker* .xlsx;
    same mapping as `backend/scripts/ingest_resume_supply_chain_partner_tracker.py`.
    """
    safe = os.path.basename(file.filename or "tracker.xlsx") or "tracker.xlsx"
    suffix = os.path.splitext(safe)[1] or ".xlsx"
    path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            path = tmp.name
            content = await file.read()
            tmp.write(content)
        out = ingest_workbook(
            path,
            db,
            user_id=user.id,
            dry_run=dry_run,
            replace_fy=replace_fy,
        )
        if dry_run:
            log_ingestion_event(
                db,
                user=user,
                kind="vendor_licenses",
                filename=safe,
                status="dry_run",
                label=f"would_upsert={out.get('would_upsert', 0)} fy={out.get('fiscal_year_label')}",
            )
        else:
            log_ingestion_event(
                db,
                user=user,
                kind="vendor_licenses",
                filename=safe,
                status="ok",
                label=f"inserted={out.get('inserted', 0)} updated={out.get('updated', 0)} deleted={out.get('deleted_prior', 0)} fy={out.get('fiscal_year_label')}",
            )
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingest failed: {e!s}") from e
    finally:
        if path and os.path.isfile(path):
            try:
                os.unlink(path)
            except OSError:
                pass


@router.get("/{license_id}")
def get_vendor_license(
    license_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    r = db.query(ResumeSupplierLicense).filter(ResumeSupplierLicense.id == license_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Vendor license row not found")
    return _row_to_dict(r)


@router.post("")
def create_vendor_license(
    body: ResumeSupplierLicenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        payload = body.model_dump()
    except AttributeError:
        payload = body.dict()
    r = ResumeSupplierLicense(
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    _apply_payload(r, payload)
    db.add(r)
    db.commit()
    db.refresh(r)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="resume_supplier_license",
        summary=f"Vendor license: {r.vendor_name}",
        project_id=None,
        resource_id=str(r.id),
    )
    return _row_to_dict(r)


@router.patch("/{license_id}")
def patch_vendor_license(
    license_id: int,
    body: ResumeSupplierLicensePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ResumeSupplierLicense).filter(ResumeSupplierLicense.id == license_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Vendor license row not found")
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    data["updated_by_user_id"] = user.id
    _apply_payload(r, data)
    db.commit()
    db.refresh(r)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="resume_supplier_license",
        summary=f"Vendor license updated (VND-{license_id})",
        project_id=None,
        resource_id=str(license_id),
    )
    return _row_to_dict(r)


@router.delete("/{license_id}")
def delete_vendor_license(
    license_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ResumeSupplierLicense).filter(ResumeSupplierLicense.id == license_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Vendor license row not found")
    name = r.vendor_name
    db.delete(r)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="resume_supplier_license",
        summary=f"Vendor license deleted: {name}",
        project_id=None,
        resource_id=str(license_id),
    )
    return {"status": "ok", "id": license_id}
