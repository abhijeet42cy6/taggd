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
        db.add(
            FinanceMonthlyLedger(
                project_id=project_id,
                reporting_month=reporting_month,
                metric_category=category,
                budget_value=budget,
                forecast_value=forecast,
                actual_value=actual,
                actual_cost=cost,
                uploaded_by="platform",
            )
        )


def _upsert_cashflow(
    db: Session,
    project_id: int,
    reporting_month: datetime.datetime,
    unbilled: float,
    collection_target: float,
    collected: float,
    bad_debt: float,
    adjustments: float,
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
        db.add(
            FinanceCashFlow(
                project_id=project_id,
                reporting_month=reporting_month,
                unbilled_amount=unbilled,
                collection_target=collection_target,
                actual_collected=collected,
                bad_debt=bad_debt,
                adjustments=adjustments,
                uploaded_by="platform",
            )
        )


def _upsert_efficiency_wl1(
    db: Session,
    project_id: int,
    reporting_month: datetime.datetime,
    actual_headcount_wl1: float,
) -> None:
    row = (
        db.query(FinanceEfficiencyKPI)
        .filter(
            FinanceEfficiencyKPI.project_id == project_id,
            FinanceEfficiencyKPI.reporting_month == reporting_month,
        )
        .first()
    )
    if row:
        row.actual_headcount_wl1 = actual_headcount_wl1
        row.uploaded_by = "platform"
    else:
        db.add(
            FinanceEfficiencyKPI(
                project_id=project_id,
                reporting_month=reporting_month,
                actual_headcount_wl1=actual_headcount_wl1,
                uploaded_by="platform",
                source_filename="platform",
            )
        )


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

    _upsert_ledger(
        db,
        body.project_id,
        reporting_month,
        "Revenue",
        body.rev_budget,
        body.rev_forecast,
        body.rev_actual,
        0.0,
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
    )
    _upsert_efficiency_wl1(
        db,
        body.project_id,
        reporting_month,
        body.actual_headcount_wl1,
    )

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
