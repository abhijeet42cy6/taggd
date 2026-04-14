"""State helpers for finance billing validation / approval (TAGGD billing rows)."""
from __future__ import annotations

import datetime
import os
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.db.database import (
    FinanceBillingValidationEvent,
    FinanceBillingWorkflow,
    TaggdRevenueBilling,
)

ST_DRAFT = "draft"
ST_SUBMITTED = "submitted"
ST_UNDER_REVIEW = "under_review"
ST_DISPUTED = "disputed"
ST_REJECTED = "rejected"
ST_JUNIOR_APPROVED = "junior_approved"
ST_CFO_PENDING = "cfo_pending"
ST_FULLY_APPROVED = "fully_approved"

ALLOW_PRACTICE_BILLING_EDIT = frozenset({ST_DRAFT, ST_DISPUTED})


def cfo_amount_threshold_inr() -> float:
    try:
        return float((os.getenv("CFO_BILLING_APPROVAL_THRESHOLD_INR") or "5_000_000").replace("_", ""))
    except ValueError:
        return 5_000_000.0


def ensure_workflow(db: Session, billing: TaggdRevenueBilling) -> FinanceBillingWorkflow:
    w = billing.workflow
    if w is not None:
        return w
    w = FinanceBillingWorkflow(taggd_revenue_billing_id=billing.id, validation_status=ST_DRAFT)
    db.add(w)
    db.flush()
    return w


def workflow_allows_billing_row_edit(w: Optional[FinanceBillingWorkflow]) -> bool:
    if w is None:
        return True
    return w.validation_status in ALLOW_PRACTICE_BILLING_EDIT


def append_event(
    db: Session,
    workflow: FinanceBillingWorkflow,
    *,
    user_id: Optional[int],
    action: str,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    db.add(
        FinanceBillingValidationEvent(
            workflow_id=workflow.id,
            user_id=user_id,
            action=action[:64],
            payload_json=payload,
        )
    )


def invoice_amount_for_cfo(billing: TaggdRevenueBilling) -> float:
    v = billing.invoice_amount_inr
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def next_status_after_junior(billing: TaggdRevenueBilling) -> str:
    """After junior validation: route to CFO queue if invoice amount meets threshold."""
    if invoice_amount_for_cfo(billing) >= cfo_amount_threshold_inr():
        return ST_CFO_PENDING
    return ST_FULLY_APPROVED
