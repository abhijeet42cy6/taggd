"""CRUD for TAGGD-style revenue / billing tracker rows (`taggd_revenue_billing`)."""
from __future__ import annotations

import datetime
import math
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.auth.deps import get_current_user
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import Project, TaggdRevenueBilling, User, get_db

router = APIRouter(prefix="/revenue-billing", tags=["revenue-billing"])


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
    attachment_ref: Optional[str] = Field(None, max_length=512)
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
    attachment_ref: Optional[str] = Field(None, max_length=512)
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
        q.options(joinedload(TaggdRevenueBilling.project))
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
        .options(joinedload(TaggdRevenueBilling.project))
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
    row = db.query(TaggdRevenueBilling).filter(TaggdRevenueBilling.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    attrs = _body_to_row_attrs(body, is_create=False)
    for k, v in attrs.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="revenue_billing",
        summary=f"Revenue billing #{row_id} updated",
        project_id=row.project_id,
        resource_id=str(row_id),
    )
    return _serialize(row)


@router.delete("/{row_id}")
def delete_revenue_billing(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(TaggdRevenueBilling).filter(TaggdRevenueBilling.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    assert_project_access(user, db, row.project_id)
    pid = row.project_id
    db.delete(row)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="revenue_billing",
        summary=f"Revenue billing #{row_id} deleted",
        project_id=pid,
        resource_id=str(row_id),
    )
    return {"status": "deleted", "id": row_id}
