"""
Merge duplicate finance_monthly_ledger and finance_cash_flow rows.

Duplicates occur when multiple sheets write the same natural key in one transaction
before SQLAlchemy flushes new rows, so later sheets' SELECT .first() misses pending INSERTs.

Merge rule: same (project_id, reporting_month, metric_category) → keep lowest id,
set each numeric field to max(existing, duplicate) so partial rows combine correctly.
"""

from __future__ import annotations

from sqlalchemy import func

from .database import FinanceCashFlow, FinanceMonthlyLedger


def dedupe_finance_monthly_ledger(db) -> int:
    """Merge duplicate ledger rows. Returns number of rows deleted."""
    deleted = 0
    dup_keys = (
        db.query(
            FinanceMonthlyLedger.project_id,
            FinanceMonthlyLedger.reporting_month,
            FinanceMonthlyLedger.metric_category,
        )
        .group_by(
            FinanceMonthlyLedger.project_id,
            FinanceMonthlyLedger.reporting_month,
            FinanceMonthlyLedger.metric_category,
        )
        .having(func.count(FinanceMonthlyLedger.id) > 1)
        .all()
    )
    for project_id, reporting_month, metric_category in dup_keys:
        rows = (
            db.query(FinanceMonthlyLedger)
            .filter(
                FinanceMonthlyLedger.project_id == project_id,
                FinanceMonthlyLedger.reporting_month == reporting_month,
                FinanceMonthlyLedger.metric_category == metric_category,
            )
            .order_by(FinanceMonthlyLedger.id.asc())
            .all()
        )
        if len(rows) < 2:
            continue
        keeper = rows[0]
        for r in rows[1:]:
            keeper.budget_value = max(keeper.budget_value or 0, r.budget_value or 0)
            keeper.forecast_value = max(keeper.forecast_value or 0, r.forecast_value or 0)
            keeper.actual_value = max(keeper.actual_value or 0, r.actual_value or 0)
            keeper.actual_cost = max(keeper.actual_cost or 0, r.actual_cost or 0)
            db.delete(r)
            deleted += 1
    return deleted


def dedupe_finance_cash_flow(db) -> int:
    """Merge duplicate cash-flow rows for the same project + month."""
    deleted = 0
    dup_keys = (
        db.query(FinanceCashFlow.project_id, FinanceCashFlow.reporting_month)
        .group_by(FinanceCashFlow.project_id, FinanceCashFlow.reporting_month)
        .having(func.count(FinanceCashFlow.id) > 1)
        .all()
    )
    for project_id, reporting_month in dup_keys:
        rows = (
            db.query(FinanceCashFlow)
            .filter(
                FinanceCashFlow.project_id == project_id,
                FinanceCashFlow.reporting_month == reporting_month,
            )
            .order_by(FinanceCashFlow.id.asc())
            .all()
        )
        if len(rows) < 2:
            continue
        keeper = rows[0]
        for r in rows[1:]:
            keeper.unbilled_amount = max(keeper.unbilled_amount or 0, r.unbilled_amount or 0)
            keeper.collection_target = max(keeper.collection_target or 0, r.collection_target or 0)
            keeper.actual_collected = max(keeper.actual_collected or 0, r.actual_collected or 0)
            keeper.bad_debt = max(keeper.bad_debt or 0, r.bad_debt or 0)
            keeper.adjustments = max(keeper.adjustments or 0, r.adjustments or 0)
            db.delete(r)
            deleted += 1
    return deleted


def dedupe_finance_tables(db) -> tuple[int, int]:
    """Run both dedupers. Returns (ledger_deleted, cashflow_deleted)."""
    ld = dedupe_finance_monthly_ledger(db)
    cd = dedupe_finance_cash_flow(db)
    return ld, cd
