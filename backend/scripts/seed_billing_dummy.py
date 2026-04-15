"""
Insert demo rows into `taggd_revenue_billing` — one row per project (cap 80), so scoped
users still see data for every project they can access in the UI.

Also creates matching `finance_billing_workflow` rows (mixed statuses) so **Finance validation**
`GET /finance-billing-workflow/queue` is non-empty — the queue only lists billings that already
have a workflow row.

Run from repo root:
  python3 -m backend.scripts.seed_billing_dummy
  python3 -m backend.scripts.seed_billing_dummy --force   # remove prior demo rows and re-seed
"""
from __future__ import annotations

import argparse
import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.core.finance_billing_workflow_core import (
    ST_CFO_PENDING,
    ST_DRAFT,
    ST_SUBMITTED,
    ST_UNDER_REVIEW,
)
from backend.db.database import FinanceBillingWorkflow, Project, SessionLocal, TaggdRevenueBilling, User

SEED_MARKER = "[demo-billing-seed]"


def _dt(y: int, m: int, d: int) -> datetime.datetime:
    return datetime.datetime(y, m, d)


def _workflow_demo_variant(billing_id: int, idx: int, uid: int | None) -> FinanceBillingWorkflow:
    """One workflow per demo billing; rotate statuses so the validation UI shows varied approval points."""
    phase = idx % 4
    if phase == 0:
        return FinanceBillingWorkflow(
            taggd_revenue_billing_id=billing_id,
            validation_status=ST_SUBMITTED,
            practice_submitted_at=_dt(2026, 3, 16),
            practice_submitted_by_user_id=uid,
        )
    if phase == 1:
        return FinanceBillingWorkflow(
            taggd_revenue_billing_id=billing_id,
            validation_status=ST_UNDER_REVIEW,
            practice_submitted_at=_dt(2026, 3, 15),
            practice_submitted_by_user_id=uid,
            finance_review_started_at=_dt(2026, 3, 17),
            finance_reviewer_user_id=uid,
        )
    if phase == 2:
        return FinanceBillingWorkflow(
            taggd_revenue_billing_id=billing_id,
            validation_status=ST_CFO_PENDING,
            practice_submitted_at=_dt(2026, 3, 14),
            practice_submitted_by_user_id=uid,
            finance_review_started_at=_dt(2026, 3, 16),
            finance_reviewer_user_id=uid,
            junior_validated_at=_dt(2026, 3, 18),
            junior_validated_by_user_id=uid,
        )
    return FinanceBillingWorkflow(
        taggd_revenue_billing_id=billing_id,
        validation_status=ST_DRAFT,
    )


def _backfill_missing_demo_workflows(db: Session, uid: int | None) -> int:
    rows = (
        db.query(TaggdRevenueBilling)
        .outerjoin(FinanceBillingWorkflow, FinanceBillingWorkflow.taggd_revenue_billing_id == TaggdRevenueBilling.id)
        .filter(
            TaggdRevenueBilling.notes.like(f"%{SEED_MARKER}%"),
            FinanceBillingWorkflow.id.is_(None),
        )
        .order_by(TaggdRevenueBilling.id.asc())
        .all()
    )
    for i, row in enumerate(rows):
        db.add(_workflow_demo_variant(row.id, i, uid))
    if rows:
        db.commit()
    return len(rows)


def _remove_seeded(db: Session) -> int:
    q = db.query(TaggdRevenueBilling).filter(
        or_(
            TaggdRevenueBilling.notes.like(f"%{SEED_MARKER}%"),
            TaggdRevenueBilling.uploaded_by == "billing_demo_seed",
        )
    )
    n = q.count()
    q.delete(synchronize_session=False)
    db.flush()
    return n


def run_seed(force: bool = False) -> dict[str, int]:
    db = SessionLocal()
    try:
        projects = db.query(Project).order_by(Project.id).all()
        if not projects:
            return {"inserted": 0, "removed": 0, "skipped": 1}

        removed = 0
        if force:
            removed = _remove_seeded(db)

        user = db.query(User).order_by(User.id).first()
        uid = user.id if user else None

        existing_seed = (
            db.query(TaggdRevenueBilling)
            .filter(TaggdRevenueBilling.notes.like(f"%{SEED_MARKER}%"))
            .first()
        )
        if existing_seed and not force:
            backfilled = _backfill_missing_demo_workflows(db, uid)
            if backfilled:
                return {"inserted": backfilled, "removed": 0, "skipped": 0, "backfill_workflows": True}
            return {"inserted": 0, "removed": 0, "skipped": 2}

        # Up to 4 demo rows — one per project slot, varied fields (INR)
        templates: list[dict] = [
            {
                "update_date": _dt(2026, 3, 15),
                "fiscal_year_label": "FY2025-26",
                "project_manager": "A. Mehta",
                "revenue_booked_inr": 48.5 * 100_000,
                "mmf_inr": 52.0 * 100_000,
                "opening_req": 18,
                "opening_fee_inr": 6.2 * 100_000,
                "total_joiners": 12,
                "taggd_joiner": 9,
                "taggd_joiner_fee_inr": 4.1 * 100_000,
                "er_ijp_other_count": 2,
                "er_ijp_other_fee_inr": 0.8 * 100_000,
                "campus_count": 1,
                "campus_fee_inr": 0.35 * 100_000,
                "total_joining_fee_inr": 5.25 * 100_000,
                "adjustment_reason": None,
                "adjustment_amt_inr": None,
                "net_revenue_inr": 46.2 * 100_000,
                "rph_inr": 2.55 * 100_000,
                "pct_of_target": 88.5,
                "invoice_number": "INV-DEMO-2401",
                "invoice_amount_inr": 46.2 * 100_000,
                "invoice_raised_date": _dt(2026, 3, 10),
                "payment_due_date": _dt(2026, 4, 9),
                "actual_payment_received_date": None,
                "collection_received_inr": None,
                "approver_name": "Finance Ops",
                "attachment_ref": "https://example.com/invoices/demo-2401.pdf",
            },
            {
                "update_date": _dt(2026, 3, 20),
                "fiscal_year_label": "FY2025-26",
                "project_manager": "R. Khanna",
                "revenue_booked_inr": 31.0 * 100_000,
                "mmf_inr": 35.0 * 100_000,
                "opening_req": 11,
                "opening_fee_inr": 3.8 * 100_000,
                "total_joiners": 7,
                "taggd_joiner": 5,
                "taggd_joiner_fee_inr": 2.6 * 100_000,
                "er_ijp_other_count": 1,
                "er_ijp_other_fee_inr": 0.4 * 100_000,
                "campus_count": 1,
                "campus_fee_inr": 0.2 * 100_000,
                "total_joining_fee_inr": 3.2 * 100_000,
                "adjustment_reason": "Rate card revision Q3",
                "adjustment_amt_inr": -0.5 * 100_000,
                "net_revenue_inr": 30.5 * 100_000,
                "rph_inr": 1.9 * 100_000,
                "pct_of_target": 78.0,
                "invoice_number": None,
                "invoice_amount_inr": None,
                "invoice_raised_date": None,
                "payment_due_date": None,
                "actual_payment_received_date": None,
                "collection_received_inr": None,
                "approver_name": None,
                "attachment_ref": None,
            },
            {
                "update_date": _dt(2026, 3, 22),
                "fiscal_year_label": "FY2025-26",
                "project_manager": "S. Nair",
                "revenue_booked_inr": 62.0 * 100_000,
                "mmf_inr": 58.0 * 100_000,
                "opening_req": 24,
                "opening_fee_inr": 9.5 * 100_000,
                "total_joiners": 15,
                "taggd_joiner": 12,
                "taggd_joiner_fee_inr": 7.2 * 100_000,
                "er_ijp_other_count": 3,
                "er_ijp_other_fee_inr": 1.1 * 100_000,
                "campus_count": 0,
                "campus_fee_inr": None,
                "total_joining_fee_inr": 8.3 * 100_000,
                "adjustment_reason": None,
                "adjustment_amt_inr": None,
                "net_revenue_inr": 61.0 * 100_000,
                "rph_inr": 2.1 * 100_000,
                "pct_of_target": 105.2,
                "invoice_number": "INV-DEMO-2403",
                "invoice_amount_inr": 61.0 * 100_000,
                "invoice_raised_date": _dt(2026, 3, 18),
                "payment_due_date": _dt(2026, 4, 17),
                "actual_payment_received_date": _dt(2026, 3, 25),
                "collection_received_inr": 61.0 * 100_000,
                "approver_name": "CFO Office",
                "attachment_ref": None,
            },
            {
                "update_date": _dt(2026, 3, 25),
                "fiscal_year_label": "FY2025-26",
                "project_manager": "P. Desai",
                "revenue_booked_inr": 18.5 * 100_000,
                "mmf_inr": 22.0 * 100_000,
                "opening_req": 8,
                "opening_fee_inr": 2.4 * 100_000,
                "total_joiners": 4,
                "taggd_joiner": 3,
                "taggd_joiner_fee_inr": 1.5 * 100_000,
                "er_ijp_other_count": 0,
                "er_ijp_other_fee_inr": None,
                "campus_count": 1,
                "campus_fee_inr": 0.15 * 100_000,
                "total_joining_fee_inr": 1.65 * 100_000,
                "adjustment_reason": None,
                "adjustment_amt_inr": None,
                "net_revenue_inr": 18.5 * 100_000,
                "rph_inr": 1.85 * 100_000,
                "pct_of_target": 72.4,
                "invoice_number": "INV-DEMO-2404",
                "invoice_amount_inr": 18.5 * 100_000,
                "invoice_raised_date": _dt(2026, 3, 24),
                "payment_due_date": _dt(2026, 4, 23),
                "actual_payment_received_date": None,
                "collection_received_inr": None,
                "approver_name": None,
                "attachment_ref": None,
            },
        ]

        MAX_PROJECTS = 80
        inserted = 0
        for idx, p in enumerate(projects[:MAX_PROJECTS]):
            tmpl = templates[idx % len(templates)]
            notes = f"Demo billing row for UI/testing (PRJ-{p.id}). {SEED_MARKER}"
            row = TaggdRevenueBilling(
                project_id=p.id,
                entered_by_user_id=uid,
                notes=notes,
                uploaded_by="billing_demo_seed",
                source_filename="seed_billing_dummy.py",
                **tmpl,
            )
            db.add(row)
            db.flush()
            db.add(_workflow_demo_variant(row.id, idx, uid))
            inserted += 1

        db.commit()
        return {"inserted": inserted, "removed": removed, "skipped": 0}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed taggd_revenue_billing with demo rows.")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Delete existing demo rows (marker in notes / uploaded_by) then re-insert.",
    )
    args = ap.parse_args()
    out = run_seed(force=args.force)
    if out.get("skipped") == 1:
        print("No projects in database — nothing seeded.")
    elif out.get("skipped") == 2:
        print("Demo billing rows already present (workflows OK) — use --force to replace.")
    else:
        if out.get("removed", 0):
            print(f"Removed {out['removed']} prior demo row(s).")
        if out.get("backfill_workflows"):
            print(f"Backfilled {out['inserted']} finance_billing_workflow row(s) for existing demo billing.")
        else:
            print(f"Inserted {out['inserted']} taggd_revenue_billing demo row(s) (with workflows).")


if __name__ == "__main__":
    main()
