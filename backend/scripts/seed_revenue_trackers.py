"""
Insert demo rows into revenue_forecast_weekly and revenue_visibility_snapshot
for existing projects and users (no new accounts).

Run from repo root:
  python3 -m backend.scripts.seed_revenue_trackers
  python3 -m backend.scripts.seed_revenue_trackers --force   # replace existing seeded rows
"""
from __future__ import annotations

import argparse
import datetime

from sqlalchemy.orm import Session

from backend.db.database import (
    Project,
    RevenueForecastWeekly,
    RevenueVisibilitySnapshot,
    SessionLocal,
    User,
)

LAKHS = 100_000.0


def _dt(y: int, m: int, d: int, hh: int = 0, mm: int = 0) -> datetime.datetime:
    return datetime.datetime(y, m, d, hh, mm)


def _first_monday(y: int, m: int) -> datetime.datetime:
    """First Monday on or after the 1st of the month."""
    d = datetime.date(y, m, 1)
    # Monday = 0
    while d.weekday() != 0:
        d += datetime.timedelta(days=1)
    return datetime.datetime(d.year, d.month, d.day)


# Portfolio monthly roll-up (₹ Lakhs) — split across up to 5 projects
_MONTHLY_LAKHS = [
    # rev_fcst, mmf, open_req, open_fee, joiners, joiner_fee, ach_pct
    (42.5, 38.0, 120, 15.0, 45, 8.5, 20.0),
    (45.0, 40.0, 130, 16.5, 50, 9.2, 20.4),
    (48.0, 43.0, 125, 17.0, 55, 10.0, 20.8),
    (50.0, 45.0, 135, 18.0, 60, 11.0, 22.0),
    (52.5, 47.0, 140, 19.5, 65, 12.5, 23.8),
]

# RPO visibility profile per slot (matches product mock proportions)
_VISIBILITY_PROFILES = [
    # mmf_inr, open_req, opening_fee, joiners, joining_fee, ytj, ytj_fee, conv, rev_real, gap, status, practice_head
    (
        5_200_000,
        12,
        480_000,
        7,
        280_000,
        5,
        200_000,
        58.3,
        5.6,
        4_520_000,
        "At Risk",
        "Practice Head A",
    ),
    (
        3_800_000,
        8,
        320_000,
        4,
        160_000,
        4,
        160_000,
        50.0,
        5.0,
        2_880_000,
        "At Risk",
        "Practice Head A",
    ),
    (
        6_700_000,
        20,
        800_000,
        9,
        360_000,
        11,
        440_000,
        45.0,
        4.8,
        6_700_000,
        "At Risk",
        "Practice Head B",
    ),
    (
        2_800_000,
        6,
        240_000,
        3,
        120_000,
        3,
        120_000,
        50.0,
        4.3,
        2_560_000,
        "At Risk",
        "Practice Head B",
    ),
    (
        3_500_000,
        15,
        600_000,
        6,
        240_000,
        9,
        360_000,
        40.0,
        5.9,
        3_500_000,
        "At Risk",
        "Practice Head C",
    ),
]


def seed_visibility(
    db: Session,
    projects: list[Project],
    user_id: int | None,
    as_of: datetime.datetime,
    force: bool,
) -> int:
    if force:
        db.query(RevenueVisibilitySnapshot).filter(
            RevenueVisibilitySnapshot.as_of_date == as_of
        ).delete(synchronize_session=False)
        db.flush()

    n = 0
    for i, p in enumerate(projects[: len(_VISIBILITY_PROFILES)]):
        exists = (
            db.query(RevenueVisibilitySnapshot)
            .filter(
                RevenueVisibilitySnapshot.project_id == p.id,
                RevenueVisibilitySnapshot.as_of_date == as_of,
            )
            .first()
        )
        if exists and not force:
            continue
        if exists and force:
            db.delete(exists)
            db.flush()

        (
            mmf,
            oreq,
            ofee,
            jn,
            jfee,
            ytj,
            ytjf,
            conv,
            revp,
            gap,
            status,
            ph,
        ) = _VISIBILITY_PROFILES[i]

        row = RevenueVisibilitySnapshot(
            project_id=p.id,
            as_of_date=as_of,
            practice_head=ph,
            mmf_inr=float(mmf),
            open_req=oreq,
            opening_fee_inr=float(ofee),
            joiners_as_on_date=jn,
            joining_fee_inr=float(jfee),
            yet_to_join=ytj,
            ytj_fee_inr=float(ytjf),
            conversion_rate_pct=conv,
            revenue_realised_pct=revp,
            gap_to_mmf_inr=float(gap),
            status=status,
            entered_by_user_id=user_id,
        )
        db.add(row)
        n += 1
    return n


def seed_forecast_weekly(
    db: Session,
    projects: list[Project],
    user_id: int | None,
    force: bool,
) -> int:
    """One row per (project, month) for Apr–Aug 2025; amounts scaled so portfolio matches mock totals."""
    n = 0
    k = max(1, min(5, len(projects)))
    # Split each month's Lakhs across k projects with slight variance
    for pi, p in enumerate(projects[:k]):
        w = 0.85 + (pi * 0.07)  # 0.85 .. 1.13
        for mi, (rev_l, mmf_l, oreq, of_l, jn, jf_l, ach) in enumerate(_MONTHLY_LAKHS):
            y, month = 2025, 4 + mi
            week_start = _first_monday(y, month)
            month_anchor = _dt(y, month, 1)
            update_date = _dt(2026, 3, 28)

            rev = rev_l * LAKHS * (w / k) * 1.15
            mmf = mmf_l * LAKHS * (w / k) * 1.15
            open_fee = of_l * LAKHS * (w / k) * 1.15
            joiner_fee = jf_l * LAKHS * (w / k) * 1.15
            net_rev = rev * 0.95

            exists = (
                db.query(RevenueForecastWeekly)
                .filter(
                    RevenueForecastWeekly.project_id == p.id,
                    RevenueForecastWeekly.week_start_date == week_start,
                )
                .first()
            )
            if exists:
                if not force:
                    continue
                db.delete(exists)
                db.flush()

            row = RevenueForecastWeekly(
                project_id=p.id,
                week_start_date=week_start,
                week_label=f"W-{month:02d}",
                month_anchor=month_anchor,
                update_date=update_date,
                revenue_forecast_inr=rev,
                adjustment_inr=0.0,
                penalty_inr=0.0,
                bad_debts_inr=0.0,
                mmf_inr=mmf,
                open_fee_inr=open_fee,
                joiner_fee_inr=joiner_fee,
                to_be_offer_fee_inr=open_fee * 0.08,
                net_revenue_inr=net_rev,
                open_req=max(1, int(oreq / k)),
                joiner_count=max(1, int(jn / k)),
                to_be_offer_count=max(0, int(8 / k)),
                achievement_pct=ach + (pi - 2) * 0.4,
                remarks="Demo seed — aligned to portfolio forecast mock",
                entered_by_user_id=user_id,
            )
            db.add(row)
            n += 1
    return n


def run_seed(force: bool = False) -> dict[str, int]:
    db = SessionLocal()
    try:
        projects = db.query(Project).order_by(Project.id).all()
        if not projects:
            return {"visibility": 0, "forecast_weekly": 0, "skipped": 1}

        user = db.query(User).order_by(User.id).first()
        uid = user.id if user else None

        as_of = _dt(2026, 3, 28)

        vis = seed_visibility(db, projects, uid, as_of, force)
        fc = seed_forecast_weekly(db, projects, uid, force)

        db.commit()
        return {"visibility": vis, "forecast_weekly": fc, "skipped": 0}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed revenue tracker demo rows for existing projects.")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Replace overlapping demo rows (same as-of / same week per project).",
    )
    args = ap.parse_args()
    out = run_seed(force=args.force)
    if out.get("skipped"):
        print("No projects in database — nothing seeded.")
    else:
        print(
            f"Seeded revenue_visibility_snapshot: {out['visibility']} rows, "
            f"revenue_forecast_weekly: {out['forecast_weekly']} rows."
        )


if __name__ == "__main__":
    main()
