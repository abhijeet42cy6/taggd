"""Manual create/update finance ledger + cashflow rows (platform UI)."""
from __future__ import annotations

import datetime
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import FinanceCashFlow, FinanceEfficiencyKPI, FinanceMonthlyLedger, User, get_db

router = APIRouter(prefix="/finance", tags=["finance"])


class FinanceLedgerUpsertBody(BaseModel):
    project_id: int = Field(..., ge=1)
    reporting_month: str = Field(..., min_length=5, max_length=40)
    rev_budget: float = 0.0
    rev_forecast: float = 0.0
    rev_actual: float = 0.0
    cm_actual: float = 0.0
    unbilled: float = 0.0
    collection_target: float = 0.0
    collected: float = 0.0
    bad_debt: float = 0.0
    adjustments: float = 0.0
    actual_headcount_wl1: float = Field(
        0.0,
        description="WL1 headcount (finance master Actual Headcount WL1); may be fractional.",
    )
    actual_headcount_finance: int | None = Field(
        None,
        description="Overall HC (Actual Headcount Overall). Omit to leave unchanged.",
    )
    taggd_joiners: float | None = Field(None, description="Monthly Taggd joiners. Omit to leave unchanged.")
    target_revenue_per_recruiter: float | None = Field(
        None, description="Target rev productivity (INR per WL1). Omit to leave unchanged."
    )
    target_ppc_inr: float | None = Field(
        None, description="Target PPC INR per overall HC. Omit to leave unchanged; null clears when sent explicitly."
    )


def _parse_month_first_day(s: str) -> datetime.datetime:
    s = s.strip()
    m = re.match(r"^(\d{4})-(\d{2})", s)
    if not m:
        raise HTTPException(status_code=400, detail="reporting_month must be YYYY-MM (e.g. 2025-03)")
    y, mo = int(m.group(1)), int(m.group(2))
    if mo < 1 or mo > 12:
        raise HTTPException(status_code=400, detail="Invalid month in reporting_month")
    return datetime.datetime(y, mo, 1)


def _upsert_ledger(
    db: Session,
    project_id: int,
    reporting_month: datetime.datetime,
    category: str,
    budget: float,
    forecast: float,
    actual: float,
    cost: float = 0.0,
    *,
    metrics_user_id: int | None = None,
    metrics_ts: datetime.datetime | None = None,
) -> None:
    row = (
        db.query(FinanceMonthlyLedger)
        .filter(
            FinanceMonthlyLedger.project_id == project_id,
            FinanceMonthlyLedger.reporting_month == reporting_month,
            FinanceMonthlyLedger.metric_category == category,
        )
        .first()
    )
    if row:
        row.budget_value = budget
        row.forecast_value = forecast
        row.actual_value = actual
        row.actual_cost = cost
    else:
        row = FinanceMonthlyLedger(
            project_id=project_id,
            reporting_month=reporting_month,
            metric_category=category,
            budget_value=budget,
            forecast_value=forecast,
            actual_value=actual,
            actual_cost=cost,
            uploaded_by="platform",
        )
        db.add(row)
        db.flush()
    if metrics_user_id is not None and metrics_ts is not None:
        row.metrics_last_updated_at = metrics_ts
        row.metrics_last_updated_by_user_id = metrics_user_id


def _upsert_cashflow(
    db: Session,
    project_id: int,
    reporting_month: datetime.datetime,
    unbilled: float,
    collection_target: float,
    collected: float,
    bad_debt: float,
    adjustments: float,
    *,
    metrics_user_id: int | None = None,
    metrics_ts: datetime.datetime | None = None,
) -> None:
    row = (
        db.query(FinanceCashFlow)
        .filter(
            FinanceCashFlow.project_id == project_id,
            FinanceCashFlow.reporting_month == reporting_month,
        )
        .first()
    )
    if row:
        row.unbilled_amount = unbilled
        row.collection_target = collection_target
        row.actual_collected = collected
        row.bad_debt = bad_debt
        row.adjustments = adjustments
    else:
        row = FinanceCashFlow(
            project_id=project_id,
            reporting_month=reporting_month,
            unbilled_amount=unbilled,
            collection_target=collection_target,
            actual_collected=collected,
            bad_debt=bad_debt,
            adjustments=adjustments,
            uploaded_by="platform",
        )
        db.add(row)
        db.flush()
    if metrics_user_id is not None and metrics_ts is not None:
        row.metrics_last_updated_at = metrics_ts
        row.metrics_last_updated_by_user_id = metrics_user_id


def _fields_set(body: FinanceLedgerUpsertBody) -> set:
    return getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set())


def _upsert_efficiency_kpi(
    db: Session,
    project_id: int,
    reporting_month: datetime.datetime,
    body: FinanceLedgerUpsertBody,
    user: User,
) -> None:
    row = (
        db.query(FinanceEfficiencyKPI)
        .filter(
            FinanceEfficiencyKPI.project_id == project_id,
            FinanceEfficiencyKPI.reporting_month == reporting_month,
        )
        .first()
    )
    fs = _fields_set(body)
    if not row:
        row = FinanceEfficiencyKPI(
            project_id=project_id,
            reporting_month=reporting_month,
            actual_headcount_wl1=body.actual_headcount_wl1,
            uploaded_by="platform",
            source_filename="platform",
        )
        db.add(row)
        db.flush()
    else:
        row.actual_headcount_wl1 = body.actual_headcount_wl1
        row.uploaded_by = "platform"

    if "actual_headcount_finance" in fs:
        row.actual_headcount_finance = int(body.actual_headcount_finance or 0)
    if "taggd_joiners" in fs:
        row.taggd_joiners = float(body.taggd_joiners or 0)
    if "target_revenue_per_recruiter" in fs:
        row.target_revenue_per_recruiter = float(body.target_revenue_per_recruiter or 0)
    if "target_ppc_inr" in fs:
        row.target_ppc_inr = body.target_ppc_inr

    row.metrics_updated_at = datetime.datetime.utcnow()
    row.metrics_updated_by_user_id = user.id


@router.post("/ledger-upsert")
async def finance_ledger_upsert(
    body: FinanceLedgerUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upserts merged finance row for one client-month:
    - finance_monthly_ledger: Revenue + Contribution Margin
    - finance_cash_flow: unbilled, collection, bad debt, adjustments
    - finance_efficiency_kpis: actual_headcount_wl1 (WL1 HC)
    """
    assert_project_access(user, db, body.project_id)
    reporting_month = _parse_month_first_day(body.reporting_month)
    mu_ts = datetime.datetime.utcnow()
    mu_uid = user.id

    _upsert_ledger(
        db,
        body.project_id,
        reporting_month,
        "Revenue",
        body.rev_budget,
        body.rev_forecast,
        body.rev_actual,
        0.0,
        metrics_user_id=mu_uid,
        metrics_ts=mu_ts,
    )
    _upsert_ledger(
        db,
        body.project_id,
        reporting_month,
        "Contribution Margin",
        0.0,
        0.0,
        body.cm_actual,
        0.0,
        metrics_user_id=mu_uid,
        metrics_ts=mu_ts,
    )
    _upsert_cashflow(
        db,
        body.project_id,
        reporting_month,
        body.unbilled,
        body.collection_target,
        body.collected,
        body.bad_debt,
        body.adjustments,
        metrics_user_id=mu_uid,
        metrics_ts=mu_ts,
    )
    _upsert_efficiency_kpi(db, body.project_id, reporting_month, body, user)

    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="finance_ledger",
        summary=f"Finance ledger upsert — {body.reporting_month} (PRJ-{body.project_id})",
        project_id=body.project_id,
        resource_id=f"{body.project_id}:{body.reporting_month}",
    )
    return {
        "status": "ok",
        "project_id": body.project_id,
        "reporting_month": reporting_month.isoformat(),
    }
