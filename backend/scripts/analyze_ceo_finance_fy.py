#!/usr/bin/env python3
"""Compare CEO View FY revenue aggregates to finance_monthly_ledger (Cloud SQL)."""
from __future__ import annotations

import datetime as dt
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import func

from backend.db.database import FinanceMonthlyLedger, SessionLocal, init_db


def fiscal_year_start(d: dt.date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def month_index_in_fy(d: dt.date) -> int:
    if d.month >= 4:
        return d.month - 4
    return d.month + 8


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        fy = int(os.environ.get("FY_START", "2026"))
        fy_end = fy + 1
        start = dt.date(fy, 4, 1)
        end = dt.date(fy_end, 3, 31)

        rows = (
            db.query(
                FinanceMonthlyLedger.project_id,
                FinanceMonthlyLedger.reporting_month,
                func.sum(FinanceMonthlyLedger.budget_value).label("budget"),
                func.sum(FinanceMonthlyLedger.forecast_value).label("forecast"),
                func.sum(FinanceMonthlyLedger.actual_value).label("actual"),
                func.count(FinanceMonthlyLedger.id).label("n"),
            )
            .filter(
                FinanceMonthlyLedger.metric_category == "Revenue",
                FinanceMonthlyLedger.reporting_month >= start,
                FinanceMonthlyLedger.reporting_month <= end,
            )
            .group_by(FinanceMonthlyLedger.project_id, FinanceMonthlyLedger.reporting_month)
            .order_by(FinanceMonthlyLedger.reporting_month)
            .all()
        )

        total_b = total_f = total_a = 0.0
        q = [0.0, 0.0, 0.0, 0.0]
        q_b = [0.0, 0.0, 0.0, 0.0]
        by_month: dict[str, dict] = {}

        for pid, rm, b, f, a, n in rows:
            if rm is None:
                continue
            d = rm.date() if hasattr(rm, "date") else rm
            if fiscal_year_start(d) != fy:
                continue
            b = float(b or 0)
            f = float(f or 0)
            a = float(a or 0)
            total_b += b
            total_f += f
            total_a += a
            qi = month_index_in_fy(d)
            q_i = 0 if qi <= 2 else 1 if qi <= 5 else 2 if qi <= 8 else 3
            q[q_i] += a
            q_b[q_i] += b
            key = d.isoformat()[:7]
            by_month.setdefault(key, {"budget": 0.0, "forecast": 0.0, "actual": 0.0, "rows": 0})
            by_month[key]["budget"] += b
            by_month[key]["forecast"] += f
            by_month[key]["actual"] += a
            by_month[key]["rows"] += int(n)

        print(f"FY{str(fy)[2:]}-{str(fy_end)[2:]} (ledger Revenue, merged per project+month)")
        print(f"  Months in range: {len(by_month)}")
        print(f"  Total actual INR:   {total_a:,.2f}  ({total_a/1e7:.2f} Cr)")
        print(f"  Total budget INR:   {total_b:,.2f}  ({total_b/1e7:.2f} Cr)")
        print(f"  Total forecast INR: {total_f:,.2f}  ({total_f/1e7:.2f} Cr)")
        print(f"  Attainment:         {(total_a/total_b*100) if total_b else 0:.1f}%")
        print("  Quarterly actual (Cr):")
        for i, v in enumerate(q, 1):
            print(f"    Q{i}: {v/1e7:.2f} Cr  (budget {q_b[i-1]/1e7:.2f} Cr)")

        print("\n  By calendar month (Cr actual / budget):")
        for k in sorted(by_month):
            m = by_month[k]
            print(f"    {k}: actual {m['actual']/1e7:.2f}  budget {m['budget']/1e7:.2f}  ledger_rows {m['rows']}")

        # Upload source breakdown
        uploads = (
            db.query(
                FinanceMonthlyLedger.uploaded_by,
                func.count(FinanceMonthlyLedger.id),
                func.sum(FinanceMonthlyLedger.actual_value),
            )
            .filter(
                FinanceMonthlyLedger.metric_category == "Revenue",
                FinanceMonthlyLedger.reporting_month >= start,
                FinanceMonthlyLedger.reporting_month <= end,
            )
            .group_by(FinanceMonthlyLedger.uploaded_by)
            .all()
        )
        print("\n  By uploaded_by (Revenue FY slice):")
        for ub, cnt, s in uploads:
            print(f"    {ub or '(null)'}: rows={cnt}, actual_sum={float(s or 0)/1e7:.2f} Cr")

        # Also check FY25-26 for confusion
        if fy == 2026:
            print("\n--- FY25-26 comparison (FY_START=2025) ---")
            os.environ["FY_START"] = "2025"
    finally:
        db.close()


if __name__ == "__main__":
    main()
