"""Finance validation, approval, payments, and audit for TAGGD revenue billing rows."""
from __future__ import annotations

import datetime
import math
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.auth.deps import get_current_user
from backend.auth.profile import effective_role, resolve_user_profile
from backend.auth.scope import apply_project_scope, assert_project_access
from backend.auth.verticals import require_vertical
from backend.core.activity_log import log_activity
from backend.core.finance_billing_workflow_core import (
    ST_CFO_PENDING,
    ST_DISPUTED,
    ST_DRAFT,
    ST_FULLY_APPROVED,
    ST_REJECTED,
    ST_SUBMITTED,
    ST_UNDER_REVIEW,
    append_event,
    cfo_amount_threshold_inr,
    ensure_workflow,
    invoice_amount_for_cfo,
    next_status_after_junior,
)
from backend.db.database import (
    FinanceBillingValidationEvent,
    FinanceBillingWorkflow,
    FinancePaymentReceipt,
    FinanceTdsCertificate,
    TaggdRevenueBilling,
    User,
    get_db,
)
from backend.routers.revenue_billing import _serialize as serialize_billing_row

router = APIRouter(prefix="/finance-billing-workflow", tags=["finance-billing-workflow"])


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime.datetime):
        return dt.isoformat()
    return str(dt)


def _serialize_receipt(r: FinancePaymentReceipt) -> dict[str, Any]:
    return {
        "id": r.id,
        "workflow_id": r.workflow_id,
        "amount_inr": r.amount_inr,
        "received_date": _iso(r.received_date),
        "payment_mode": r.payment_mode,
        "utr_reference": r.utr_reference,
        "partial": bool(r.partial),
        "notes": r.notes,
        "created_by_user_id": r.created_by_user_id,
        "created_at": _iso(r.created_at),
    }


def _serialize_event(e: Any) -> dict[str, Any]:
    return {
        "id": e.id,
        "workflow_id": e.workflow_id,
        "user_id": e.user_id,
        "action": e.action,
        "payload_json": e.payload_json,
        "created_at": _iso(e.created_at),
    }


def _serialize_workflow_full(
    w: FinanceBillingWorkflow,
    billing: TaggdRevenueBilling,
    db: Session,
) -> dict[str, Any]:
    inv = billing.invoice_amount_inr or 0.0
    receipts = list(w.payment_receipts or [])
    paid = sum(float(x.amount_inr or 0) for x in receipts)
    outstanding = None
    if inv and math.isfinite(inv):
        outstanding = float(inv) - paid
    return {
        "id": w.id,
        "taggd_revenue_billing_id": w.taggd_revenue_billing_id,
        "validation_status": w.validation_status,
        "practice_submitted_at": _iso(w.practice_submitted_at),
        "practice_submitted_by_user_id": w.practice_submitted_by_user_id,
        "finance_reviewer_user_id": w.finance_reviewer_user_id,
        "finance_review_started_at": _iso(w.finance_review_started_at),
        "validation_completed_at": _iso(w.validation_completed_at),
        "discrepancy_notes": w.discrepancy_notes,
        "payment_mode": w.payment_mode,
        "payment_reference_utr": w.payment_reference_utr,
        "partial_payment": w.partial_payment,
        "amount_received_inr": w.amount_received_inr,
        "tds_deducted_inr": w.tds_deducted_inr,
        "gst_reconciliation_status": w.gst_reconciliation_status,
        "junior_validated_by_user_id": w.junior_validated_by_user_id,
        "junior_validated_at": _iso(w.junior_validated_at),
        "cfo_approved_by_user_id": w.cfo_approved_by_user_id,
        "cfo_approved_at": _iso(w.cfo_approved_at),
        "cfo_sign_off_acknowledged": w.cfo_sign_off_acknowledged,
        "bank_match_status": w.bank_match_status,
        "bank_match_confidence": w.bank_match_confidence,
        "bank_match_payload_json": w.bank_match_payload_json,
        "overdue_escalation_last_at": _iso(w.overdue_escalation_last_at),
        "overdue_escalation_level": w.overdue_escalation_level,
        "created_at": _iso(w.created_at),
        "updated_at": _iso(w.updated_at),
        "outstanding_inr": outstanding,
        "payment_receipts": [_serialize_receipt(x) for x in receipts],
        "invoice_amount_inr_for_threshold": invoice_amount_for_cfo(billing),
        "cfo_threshold_inr": cfo_amount_threshold_inr(),
    }


def _load_billing(db: Session, billing_id: int) -> Optional[TaggdRevenueBilling]:
    return (
        db.query(TaggdRevenueBilling)
        .options(
            joinedload(TaggdRevenueBilling.workflow).joinedload(FinanceBillingWorkflow.payment_receipts),
            joinedload(TaggdRevenueBilling.project),
        )
        .filter(TaggdRevenueBilling.id == billing_id)
        .first()
    )


def _may_finance_validation(user: User, db: Session) -> bool:
    p = resolve_user_profile(db.query(User).filter(User.id == user.id).first() or user, db)
    from backend.auth.profile import profile_may_access_vertical

    return profile_may_access_vertical(p, "finance_validation")


def _may_revenue_billing(user: User, db: Session) -> bool:
    p = resolve_user_profile(db.query(User).filter(User.id == user.id).first() or user, db)
    from backend.auth.profile import profile_may_access_vertical

    return profile_may_access_vertical(p, "revenue_billing")


def _assert_finance_validation(user: User, db: Session) -> None:
    if not _may_finance_validation(user, db):
        raise HTTPException(status_code=403, detail="Vertical 'finance_validation' not enabled for this account")


def _assert_revenue_billing(user: User, db: Session) -> None:
    if not _may_revenue_billing(user, db):
        raise HTTPException(status_code=403, detail="Vertical 'revenue_billing' not enabled for this account")


def _practice_may_submit(user: User, db: Session) -> bool:
    """Practice-side submit: project heads and operations with billing vertical."""
    r = effective_role(user)
    if r in ("platform_admin", "executive"):
        return _may_revenue_billing(user, db)
    if r == "project_head":
        return _may_revenue_billing(user, db)
    if r == "operations":
        return _may_revenue_billing(user, db)
    return False


@router.get("/queue")
def list_workflow_queue(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
    status: Optional[str] = Query(None, description="Filter by validation_status"),
    project_id: Optional[int] = Query(None),
    mine: bool = Query(False, description="Only rows assigned to me as reviewer"),
    overdue_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    q = (
        db.query(FinanceBillingWorkflow)
        .join(TaggdRevenueBilling, FinanceBillingWorkflow.taggd_revenue_billing_id == TaggdRevenueBilling.id)
        .options(
            joinedload(FinanceBillingWorkflow.billing).joinedload(TaggdRevenueBilling.project),
            joinedload(FinanceBillingWorkflow.payment_receipts),
        )
    )
    q = apply_project_scope(q, user, db, TaggdRevenueBilling)
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(TaggdRevenueBilling.project_id == project_id)
    if status and str(status).strip():
        q = q.filter(FinanceBillingWorkflow.validation_status == str(status).strip())
    if mine:
        q = q.filter(FinanceBillingWorkflow.finance_reviewer_user_id == user.id)
    if overdue_only:
        today = datetime.datetime.utcnow().date()
        q = q.filter(
            TaggdRevenueBilling.payment_due_date.isnot(None),
            TaggdRevenueBilling.payment_due_date < datetime.datetime.combine(today, datetime.time.min),
            FinanceBillingWorkflow.validation_status != ST_FULLY_APPROVED,
        )
    total = q.count()
    rows = q.order_by(FinanceBillingWorkflow.updated_at.desc()).offset(offset).limit(limit).all()
    out = []
    for w in rows:
        b = w.billing
        if not b:
            continue
        item = serialize_billing_row(b)
        item["workflow"] = _serialize_workflow_full(w, b, db)
        out.append(item)
    return {"items": out, "total": total, "limit": limit, "offset": offset}


@router.get("/{billing_id}")
def get_workflow_for_billing(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    u = db.query(User).filter(User.id == user.id).first() or user
    if not (_may_finance_validation(u, db) or _may_revenue_billing(u, db)):
        raise HTTPException(status_code=403, detail="Missing finance_validation or revenue_billing access")
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    db.commit()
    db.refresh(w)
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.get("/{billing_id}/events")
def list_validation_events(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    u = db.query(User).filter(User.id == user.id).first() or user
    if not (_may_finance_validation(u, db) or _may_revenue_billing(u, db)):
        raise HTTPException(status_code=403, detail="Missing finance_validation or revenue_billing access")
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = billing.workflow
    if not w:
        return {"items": []}
    evs = (
        db.query(FinanceBillingValidationEvent)
        .filter(FinanceBillingValidationEvent.workflow_id == w.id)
        .order_by(FinanceBillingValidationEvent.id.asc())
        .all()
    )
    return {"items": [_serialize_event(e) for e in evs]}


class WorkflowPatchBody(BaseModel):
    finance_reviewer_user_id: Optional[int] = None
    discrepancy_notes: Optional[str] = Field(None, max_length=65535)
    payment_mode: Optional[str] = Field(None, max_length=32)
    payment_reference_utr: Optional[str] = Field(None, max_length=255)
    partial_payment: Optional[bool] = None
    amount_received_inr: Optional[float] = None
    tds_deducted_inr: Optional[float] = None
    gst_reconciliation_status: Optional[str] = Field(None, max_length=32)
    bank_match_status: Optional[str] = Field(None, max_length=64)
    bank_match_confidence: Optional[float] = None
    bank_match_payload_json: Optional[dict[str, Any]] = None


@router.patch("/{billing_id}")
def patch_workflow_fields(
    billing_id: int,
    body: WorkflowPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    raw = body.model_dump(exclude_unset=True)
    if "finance_reviewer_user_id" in raw and raw["finance_reviewer_user_id"] is not None:
        uid = raw["finance_reviewer_user_id"]
        if not db.query(User).filter(User.id == uid, User.is_active.is_(True)).first():
            raise HTTPException(status_code=400, detail="Invalid reviewer user id")
        w.finance_reviewer_user_id = uid
    for k in (
        "discrepancy_notes",
        "payment_mode",
        "payment_reference_utr",
        "partial_payment",
        "amount_received_inr",
        "tds_deducted_inr",
        "gst_reconciliation_status",
        "bank_match_status",
        "bank_match_confidence",
        "bank_match_payload_json",
    ):
        if k in raw:
            setattr(w, k, raw[k])
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="workflow_patch", payload=raw)
    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="finance_billing_workflow",
        summary=f"Workflow billing #{billing_id} fields updated",
        project_id=billing.project_id,
        resource_id=str(w.id),
    )
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.post("/{billing_id}/submit")
def practice_submit(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_revenue_billing(user, db)
    if not _practice_may_submit(user, db):
        raise HTTPException(status_code=403, detail="Only project heads, operations, executive, or admin may submit")
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status not in (ST_DRAFT, ST_DISPUTED):
        raise HTTPException(status_code=400, detail=f"Cannot submit from status {w.validation_status}")
    w.validation_status = ST_SUBMITTED
    w.practice_submitted_at = datetime.datetime.utcnow()
    w.practice_submitted_by_user_id = user.id
    w.discrepancy_notes = None
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="practice_submit", payload=None)
    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="finance_billing_workflow",
        summary=f"Billing #{billing_id} submitted for finance review",
        project_id=billing.project_id,
        resource_id=str(w.id),
    )
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.post("/{billing_id}/start-review")
def finance_start_review(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status != ST_SUBMITTED:
        raise HTTPException(status_code=400, detail="Row must be in submitted state")
    w.validation_status = ST_UNDER_REVIEW
    w.finance_reviewer_user_id = user.id
    w.finance_review_started_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="start_review", payload=None)
    db.commit()
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.post("/{billing_id}/dispute")
def finance_dispute_to_practice(
    billing_id: int,
    body: WorkflowPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    """Send back to practice with discrepancy notes."""
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status not in (ST_SUBMITTED, ST_UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Can only dispute from submitted or under_review")
    notes = (body.discrepancy_notes or "").strip() if body.discrepancy_notes else ""
    if not notes:
        raise HTTPException(status_code=400, detail="discrepancy_notes required")
    w.validation_status = ST_DISPUTED
    w.discrepancy_notes = notes[:65535]
    w.finance_review_started_at = None
    w.validation_completed_at = None
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="dispute", payload={"notes": notes[:2000]})
    db.commit()
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.post("/{billing_id}/junior-approve")
def junior_finance_approve(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status != ST_UNDER_REVIEW:
        raise HTTPException(status_code=400, detail="Must be under_review")
    nxt = next_status_after_junior(billing)
    w.validation_status = nxt
    w.junior_validated_by_user_id = user.id
    w.junior_validated_at = datetime.datetime.utcnow()
    w.validation_completed_at = datetime.datetime.utcnow() if nxt == ST_FULLY_APPROVED else None
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="junior_approve", payload={"next": w.validation_status})
    db.commit()
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


class CfoApproveBody(BaseModel):
    cfo_sign_off_acknowledged: bool = False


@router.post("/{billing_id}/cfo-approve")
def cfo_approve(
    billing_id: int,
    body: CfoApproveBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    r = effective_role(user)
    if r not in ("platform_admin", "executive", "operations"):
        raise HTTPException(status_code=403, detail="CFO approval requires executive, operations, or platform admin")
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status != ST_CFO_PENDING:
        raise HTTPException(status_code=400, detail="Not in cfo_pending state")
    w.validation_status = ST_FULLY_APPROVED
    w.cfo_approved_by_user_id = user.id
    w.cfo_approved_at = datetime.datetime.utcnow()
    w.cfo_sign_off_acknowledged = bool(body.cfo_sign_off_acknowledged)
    db.commit()
    db.refresh(w)
    w.validation_completed_at = datetime.datetime.utcnow()
    append_event(db, w, user_id=user.id, action="cfo_approve", payload=None)
    db.commit()
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


@router.post("/{billing_id}/reject")
def finance_reject(
    billing_id: int,
    body: WorkflowPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    if w.validation_status not in (ST_SUBMITTED, ST_UNDER_REVIEW, ST_CFO_PENDING):
        raise HTTPException(status_code=400, detail="Cannot reject from this state")
    notes = (body.discrepancy_notes or "").strip() if body.discrepancy_notes else ""
    w.validation_status = ST_REJECTED
    w.discrepancy_notes = (notes or "Rejected")[:65535]
    db.commit()
    db.refresh(w)
    append_event(db, w, user_id=user.id, action="reject", payload=None)
    db.commit()
    d = serialize_billing_row(billing)
    d["workflow"] = _serialize_workflow_full(w, billing, db)
    return d


class PaymentReceiptBody(BaseModel):
    amount_inr: float
    received_date: Optional[str] = None
    payment_mode: Optional[str] = Field(None, max_length=32)
    utr_reference: Optional[str] = Field(None, max_length=255)
    partial: bool = False
    notes: Optional[str] = Field(None, max_length=4000)


@router.post("/{billing_id}/payment-receipts")
def add_payment_receipt(
    billing_id: int,
    body: PaymentReceiptBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    rd: Optional[datetime.datetime] = None
    if body.received_date and str(body.received_date).strip():
        try:
            d = str(body.received_date).strip()[:10]
            y, mo, da = int(d[0:4]), int(d[5:7]), int(d[8:10])
            rd = datetime.datetime(y, mo, da)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid received_date")
    pr = FinancePaymentReceipt(
        workflow_id=w.id,
        amount_inr=float(body.amount_inr),
        received_date=rd,
        payment_mode=body.payment_mode,
        utr_reference=body.utr_reference,
        partial=body.partial,
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    append_event(
        db,
        w,
        user_id=user.id,
        action="payment_receipt",
        payload={"amount_inr": body.amount_inr, "utr": body.utr_reference},
    )
    db.commit()
    return _serialize_receipt(pr)


class TdsCertBody(BaseModel):
    fy_label: Optional[str] = Field(None, max_length=64)
    counterparty_name: Optional[str] = Field(None, max_length=512)
    certificate_type: Optional[str] = Field(None, max_length=64)
    received_date: Optional[str] = None
    file_ref: Optional[str] = Field(None, max_length=512)
    notes: Optional[str] = Field(None, max_length=4000)


@router.post("/{billing_id}/tds-certificates")
def add_tds_certificate(
    billing_id: int,
    body: TdsCertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    rd = None
    if body.received_date and str(body.received_date).strip():
        try:
            d = str(body.received_date).strip()[:10]
            y, mo, da = int(d[0:4]), int(d[5:7]), int(d[8:10])
            rd = datetime.datetime(y, mo, da)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid received_date")
    row = FinanceTdsCertificate(
        workflow_id=w.id,
        project_id=billing.project_id,
        fy_label=body.fy_label,
        counterparty_name=body.counterparty_name,
        certificate_type=body.certificate_type or "16A",
        received_date=rd,
        file_ref=body.file_ref,
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    append_event(db, w, user_id=user.id, action="tds_certificate", payload={"id": row.id})
    db.commit()
    return {
        "id": row.id,
        "workflow_id": row.workflow_id,
        "project_id": row.project_id,
        "fy_label": row.fy_label,
        "counterparty_name": row.counterparty_name,
        "certificate_type": row.certificate_type,
        "received_date": _iso(row.received_date),
        "file_ref": row.file_ref,
        "notes": row.notes,
    }


@router.post("/{billing_id}/run-overdue-escalation")
def run_overdue_escalation_stub(
    billing_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_vertical("finance_validation")),
):
    """Mark escalation timestamp (alerts integration TBD)."""
    billing = _load_billing(db, billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing row not found")
    assert_project_access(user, db, billing.project_id)
    w = ensure_workflow(db, billing)
    w.overdue_escalation_last_at = datetime.datetime.utcnow()
    w.overdue_escalation_level = (w.overdue_escalation_level or 0) + 1
    db.commit()
    append_event(db, w, user_id=user.id, action="overdue_escalation_tick", payload={"level": w.overdue_escalation_level})
    db.commit()
    return {"status": "ok", "overdue_escalation_level": w.overdue_escalation_level}
