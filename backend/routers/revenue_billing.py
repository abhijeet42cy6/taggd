"""CRUD for TAGGD-style revenue / billing tracker rows (`taggd_revenue_billing`)."""
from __future__ import annotations

import datetime
import math
import mimetypes
import os
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.auth.deps import get_current_user, is_platform_admin
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.core.finance_billing_workflow_core import workflow_allows_billing_row_edit
from backend.db.database import Project, TaggdRevenueBilling, User, get_db

router = APIRouter(
    prefix="/revenue-billing",
    tags=["revenue-billing"],
    dependencies=[Depends(require_vertical("revenue_billing"))],
)


def _parse_dt_optional(val: Optional[str]) -> Optional[datetime.datetime]:
    if val is None or not str(val).strip():
        return None
    s = str(val).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if not m:
        raise HTTPException(status_code=400, detail=f"Invalid date: {val!r}")
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime.datetime(y, mo, d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid calendar date")


def _serialize(row: TaggdRevenueBilling) -> dict[str, Any]:
    def iso(dt: Optional[datetime.datetime]) -> Optional[str]:
        if dt is None:
            return None
        if hasattr(dt, "date"):
            try:
                return dt.date().isoformat()
            except Exception:
                return dt.isoformat()
        return str(dt)

    p = row.project
    d = {
        "id": row.id,
        "project_id": row.project_id,
        "account_name": (p.account_name or p.filename or "") if p else "",
        "update_date": iso(row.update_date),
        "fiscal_year_label": row.fiscal_year_label,
        "project_manager": row.project_manager,
        "revenue_booked_inr": row.revenue_booked_inr,
        "mmf_inr": row.mmf_inr,
        "opening_req": row.opening_req,
        "opening_fee_inr": row.opening_fee_inr,
        "total_joiners": row.total_joiners,
        "taggd_joiner": row.taggd_joiner,
        "taggd_joiner_fee_inr": row.taggd_joiner_fee_inr,
        "er_ijp_other_count": row.er_ijp_other_count,
        "er_ijp_other_fee_inr": row.er_ijp_other_fee_inr,
        "campus_count": row.campus_count,
        "campus_fee_inr": row.campus_fee_inr,
        "total_joining_fee_inr": row.total_joining_fee_inr,
        "adjustment_reason": row.adjustment_reason,
        "adjustment_amt_inr": row.adjustment_amt_inr,
        "net_revenue_inr": row.net_revenue_inr,
        "rph_inr": row.rph_inr,
        "pct_of_target": row.pct_of_target,
        "attachment_ref": row.attachment_ref,
        "approver_name": row.approver_name,
        "invoice_number": row.invoice_number,
        "invoice_amount_inr": row.invoice_amount_inr,
        "invoice_raised_date": iso(row.invoice_raised_date),
        "payment_due_date": iso(row.payment_due_date),
        "actual_payment_received_date": iso(row.actual_payment_received_date),
        "collection_received_inr": row.collection_received_inr,
        "notes": row.notes,
        "entered_by_user_id": row.entered_by_user_id,
        "system_created_at": row.system_created_at.isoformat() if row.system_created_at else None,
        "system_updated_at": row.system_updated_at.isoformat() if row.system_updated_at else None,
        "source_filename": row.source_filename,
        "uploaded_by": row.uploaded_by,
    }
    for k, v in list(d.items()):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            d[k] = None
    wf = getattr(row, "workflow", None)
    if wf is not None:
        d["workflow"] = {
            "id": wf.id,
            "validation_status": wf.validation_status,
            "practice_submitted_at": iso(wf.practice_submitted_at),
            "finance_reviewer_user_id": wf.finance_reviewer_user_id,
            "junior_validated_at": iso(wf.junior_validated_at),
            "cfo_approved_at": iso(wf.cfo_approved_at),
        }
    else:
        d["workflow"] = None
    return d


class RevenueBillingCreateBody(BaseModel):
    project_id: int = Field(..., ge=1)
    update_date: Optional[str] = None
    fiscal_year_label: Optional[str] = Field(None, max_length=64)
    project_manager: Optional[str] = Field(None, max_length=255)
    revenue_booked_inr: Optional[float] = None
    mmf_inr: Optional[float] = None
    opening_req: Optional[int] = None
    opening_fee_inr: Optional[float] = None
    total_joiners: Optional[int] = None
    taggd_joiner: Optional[int] = None
    taggd_joiner_fee_inr: Optional[float] = None
    er_ijp_other_count: Optional[int] = None
    er_ijp_other_fee_inr: Optional[float] = None
    campus_count: Optional[int] = None
    campus_fee_inr: Optional[float] = None
    total_joining_fee_inr: Optional[float] = None
    adjustment_reason: Optional[str] = None
    adjustment_amt_inr: Optional[float] = None
    net_revenue_inr: Optional[float] = None
    rph_inr: Optional[float] = None
    pct_of_target: Optional[float] = None
    attachment_ref: Optional[str] = Field(None, max_length=16384)
    approver_name: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=128)
    invoice_amount_inr: Optional[float] = None
    invoice_raised_date: Optional[str] = None
    payment_due_date: Optional[str] = None
    actual_payment_received_date: Optional[str] = None
    collection_received_inr: Optional[float] = None
    notes: Optional[str] = None


class RevenueBillingPatchBody(BaseModel):
    update_date: Optional[str] = None
    fiscal_year_label: Optional[str] = Field(None, max_length=64)
    project_manager: Optional[str] = Field(None, max_length=255)
    revenue_booked_inr: Optional[float] = None
    mmf_inr: Optional[float] = None
    opening_req: Optional[int] = None
    opening_fee_inr: Optional[float] = None
    total_joiners: Optional[int] = None
    taggd_joiner: Optional[int] = None
    taggd_joiner_fee_inr: Optional[float] = None
    er_ijp_other_count: Optional[int] = None
    er_ijp_other_fee_inr: Optional[float] = None
    campus_count: Optional[int] = None
    campus_fee_inr: Optional[float] = None
    total_joining_fee_inr: Optional[float] = None
    adjustment_reason: Optional[str] = None
    adjustment_amt_inr: Optional[float] = None
    net_revenue_inr: Optional[float] = None
    rph_inr: Optional[float] = None
    pct_of_target: Optional[float] = None
    attachment_ref: Optional[str] = Field(None, max_length=16384)
    approver_name: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=128)
    invoice_amount_inr: Optional[float] = None
    invoice_raised_date: Optional[str] = None
    payment_due_date: Optional[str] = None
    actual_payment_received_date: Optional[str] = None
    collection_received_inr: Optional[float] = None
    notes: Optional[str] = None


def _body_to_row_attrs(body: RevenueBillingCreateBody | RevenueBillingPatchBody, *, is_create: bool) -> dict[str, Any]:
    raw = body.model_dump() if is_create else body.model_dump(exclude_unset=True)
    raw.pop("project_id", None)
    out: dict[str, Any] = {}
    date_fields = {
        "update_date",
        "invoice_raised_date",
        "payment_due_date",
        "actual_payment_received_date",
    }
    for k, v in raw.items():
        if k in date_fields:
            out[k] = _parse_dt_optional(v) if v is not None else None
            continue
        if v is None and not is_create:
            continue
        if isinstance(v, str) and not v.strip() and k in ("fiscal_year_label", "project_manager", "adjustment_reason", "attachment_ref", "approver_name", "invoice_number", "notes"):
            out[k] = None
        else:
            out[k] = v
    return out


@router.get("")
def list_revenue_billing(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    project_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    q = db.query(TaggdRevenueBilling)
    q = apply_project_scope(q, user, db, TaggdRevenueBilling)
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(TaggdRevenueBilling.project_id == project_id)
    total = q.count()
    rows = (
        q.options(
            joinedload(TaggdRevenueBilling.project),
            joinedload(TaggdRevenueBilling.workflow),
        )
        .order_by(TaggdRevenueBilling.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"items": [_serialize(x) for x in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/{row_id}")
def get_revenue_billing(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(TaggdRevenueBilling)
        .options(joinedload(TaggdRevenueBilling.project), joinedload(TaggdRevenueBilling.workflow))
        .filter(TaggdRevenueBilling.id == row_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    return _serialize(row)


@router.post("")
def create_revenue_billing(
    body: RevenueBillingCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, body.project_id)
    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    attrs = _body_to_row_attrs(body, is_create=True)
    row = TaggdRevenueBilling(project_id=body.project_id, entered_by_user_id=user.id, **attrs)
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="revenue_billing",
        summary=f"Revenue billing row PRJ-{body.project_id} #{row.id}",
        project_id=body.project_id,
        resource_id=str(row.id),
    )
    return _serialize(row)


@router.patch("/{row_id}")
def patch_revenue_billing(
    row_id: int,
    body: RevenueBillingPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(TaggdRevenueBilling)
        .options(joinedload(TaggdRevenueBilling.workflow))
        .filter(TaggdRevenueBilling.id == row_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    wf = row.workflow
    wf_status_before = wf.validation_status if wf is not None else None
    locked = not workflow_allows_billing_row_edit(wf)
    admin_override = locked and is_platform_admin(user)
    if locked and not admin_override:
        raise HTTPException(
            status_code=423,
            detail="This billing row is locked for editing under the finance validation workflow.",
        )
    attrs = _body_to_row_attrs(body, is_create=False)
    for k, v in attrs.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    meta: Optional[dict[str, Any]] = None
    if admin_override:
        meta = {
            "admin_bypass_finance_workflow_lock": True,
            "workflow_status_before": wf_status_before,
            "patched_keys": sorted(attrs.keys()),
        }
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="revenue_billing",
        summary=f"Revenue billing #{row_id} updated"
        + (" (platform admin override)" if admin_override else ""),
        project_id=row.project_id,
        resource_id=str(row_id),
        meta=meta,
    )
    return _serialize(row)


@router.delete("/{row_id}")
def delete_revenue_billing(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (
        db.query(TaggdRevenueBilling)
        .options(joinedload(TaggdRevenueBilling.workflow))
        .filter(TaggdRevenueBilling.id == row_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    wf = row.workflow
    wf_status_before = wf.validation_status if wf is not None else None
    locked = not workflow_allows_billing_row_edit(wf)
    admin_override = locked and is_platform_admin(user)
    if locked and not admin_override:
        raise HTTPException(
            status_code=423,
            detail="Cannot delete while this billing row is in an active finance workflow state.",
        )
    pid = row.project_id
    db.delete(row)
    db.commit()
    meta: Optional[dict[str, Any]] = None
    if admin_override:
        meta = {
            "admin_bypass_finance_workflow_lock": True,
            "workflow_status_before": wf_status_before,
        }
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="revenue_billing",
        summary=f"Revenue billing #{row_id} deleted"
        + (" (platform admin override)" if admin_override else ""),
        project_id=pid,
        resource_id=str(row_id),
        meta=meta,
    )
    return {"status": "deleted", "id": row_id}


@router.post("/{row_id}/upload-billing-attachment")
async def upload_billing_attachment(
    row_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Store an invoice / supporting file on disk; append `billing:…` to `attachment_ref`."""
    from backend.core.billing_attachment_storage import (
        append_billing_upload_to_ref,
        save_billing_attachment_file,
    )

    row = (
        db.query(TaggdRevenueBilling)
        .options(joinedload(TaggdRevenueBilling.workflow))
        .filter(TaggdRevenueBilling.id == row_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    wf = row.workflow
    wf_status_before = wf.validation_status if wf is not None else None
    locked = not workflow_allows_billing_row_edit(wf)
    admin_override = locked and is_platform_admin(user)
    if locked and not admin_override:
        raise HTTPException(
            status_code=423,
            detail="This billing row is locked for editing under the finance validation workflow.",
        )

    raw = await file.read()
    try:
        filename = save_billing_attachment_file(row_id, raw, file.filename or "upload")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    row.attachment_ref = append_billing_upload_to_ref(row.attachment_ref, filename) or None
    db.commit()
    db.refresh(row)
    upload_meta: dict[str, Any] = {"filename": filename}
    if admin_override:
        upload_meta["admin_bypass_finance_workflow_lock"] = True
        upload_meta["workflow_status_before"] = wf_status_before
    log_activity(
        db,
        user=user,
        action="upload",
        resource_type="revenue_billing",
        summary=f"Billing attachment uploaded for BIL-{row_id}"
        + (" (platform admin override)" if admin_override else ""),
        project_id=row.project_id,
        resource_id=str(row_id),
        meta=upload_meta,
    )
    return _serialize(row)


@router.get("/{row_id}/billing-attachment")
def serve_billing_attachment(
    row_id: int,
    f: Optional[str] = Query(None, description="Stored basename (recommended when multiple files exist)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download a stored billing attachment. Without `f`, serves the newest upload."""
    from backend.core.billing_attachment_storage import (
        parse_billing_file_basenames,
        pick_latest_billing_filename,
        resolve_billing_attachment_path,
    )

    row = (
        db.query(TaggdRevenueBilling)
        .options(joinedload(TaggdRevenueBilling.project))
        .filter(TaggdRevenueBilling.id == row_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)

    ref = (getattr(row, "attachment_ref", None) or "").strip()
    filenames = parse_billing_file_basenames(ref)
    if not filenames:
        raise HTTPException(
            status_code=404,
            detail="No stored billing files — upload from the billing sheet or add billing: lines to attachment_ref.",
        )

    f_q = (f or "").strip()
    if f_q:
        pick = os.path.basename(f_q)
        if pick not in filenames:
            raise HTTPException(status_code=404, detail="Requested file is not attached to this billing row")
    else:
        pick = pick_latest_billing_filename(filenames)

    from backend.core.http_file_response import stored_file_response

    mt = mimetypes.guess_type(pick)[0] or "application/octet-stream"
    resp = stored_file_response(
        "billing_documents",
        pick,
        download_name=os.path.basename(pick),
        media_type=mt,
    )
    if resp is None:
        raise HTTPException(status_code=404, detail="Attachment file not found")
    return resp
