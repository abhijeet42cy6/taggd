"""
Seed FY 2025-26 job board / vendor license rows into resume_supplier_licenses.

Idempotent: removes existing rows with fiscal_year_label='FY 2025-26' and matching
vendor_name from this seed set, then inserts fresh rows.

Usage (from repo root):
  python3 -m backend.scripts.seed_vendor_licenses_fy2026
"""
from __future__ import annotations

import datetime
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy.orm import Session  # noqa: E402

from backend.db.database import ResumeSupplierLicense, SessionLocal, init_db  # noqa: E402


FY = "FY 2025-26"

# (vendor_name, login_ids, resume_inv, job_postings, naukri_invites, start, end, months, cost_inr, remarks)
SEED: list[tuple] = [
    ("LinkedIn", 20, None, 80, None, "2025-04-05", "2026-04-04", 11, 49_150_120.0, None),
    ("Shine", 20, "300,000", 650, None, "2025-02-01", "2026-03-31", 13, 40_000_000.0, None),
    ("ApnaJobs", 80, "300,000", 300, None, "2025-02-01", "2026-03-31", 13, 7_500_000.0, None),
    ("FoundIT (Monster)", 62, "Unlimited", 1500, None, "2025-05-02", "2026-05-01", 11, 20_254_500.0, None),
    (
        "Naukri – Taggd (Main)",
        130,
        "1,600,000",
        1500,
        1_600_000,
        "2025-03-01",
        "2026-02-28",
        11,
        35_000_000.0,
        "Primary ATS License",
    ),
    (
        "Naukri – HPE",
        4,
        "25,000",
        100,
        250_000,
        "2025-11-10",
        "2026-11-09",
        11,
        4_066_000.0,
        "Client-specific",
    ),
    (
        "Naukri – Honeywell",
        3,
        "35,000",
        100,
        100_000,
        "2025-11-06",
        "2026-11-05",
        11,
        2_600_100.0,
        "Client-specific",
    ),
    (
        "HR GURU (Alternate Sourcing)",
        18,
        "100,000",
        0,
        None,
        "2026-03-02",
        "2027-03-01",
        11,
        1_000_000.0,
        "Alternate sourcing partner",
    ),
]

VENDOR_NAMES = [row[0] for row in SEED]


def _parse_date(s: str) -> datetime.date:
    return datetime.date.fromisoformat(s)


def run(db: Session | None = None) -> dict:
    own = db is None
    if own:
        db = SessionLocal()
    deleted = 0
    created = 0
    try:
        q = (
            db.query(ResumeSupplierLicense)
            .filter(
                ResumeSupplierLicense.fiscal_year_label == FY,
                ResumeSupplierLicense.vendor_name.in_(VENDOR_NAMES),
            )
            .all()
        )
        for r in q:
            db.delete(r)
            deleted += 1
        for i, row in enumerate(SEED):
            (
                vendor_name,
                login_ids,
                resume_inv,
                job_postings,
                naukri_invites,
                start_s,
                end_s,
                months,
                cost_inr,
                remarks,
            ) = row
            rec = ResumeSupplierLicense(
                vendor_name=vendor_name,
                login_ids_count=login_ids,
                resume_inventory=resume_inv,
                job_postings=job_postings,
                naukri_invites=naukri_invites,
                utilization=None,
                start_date=_parse_date(start_s),
                end_date=_parse_date(end_s),
                contract_duration_months=months,
                cost_inr=cost_inr,
                primary_person_name=None,
                primary_person_phone=None,
                primary_person_email=None,
                secondary_person_name=None,
                secondary_person_phone=None,
                secondary_person_email=None,
                remarks=remarks,
                fiscal_year_label=FY,
                sort_order=i,
                created_by_user_id=None,
                updated_by_user_id=None,
            )
            db.add(rec)
            created += 1
        db.commit()
        return {"fiscal_year": FY, "deleted_prior_seed_rows": deleted, "inserted": created}
    except Exception:
        db.rollback()
        raise
    finally:
        if own:
            db.close()


def main():
    init_db()
    r = run()
    print(r)


if __name__ == "__main__":
    main()
