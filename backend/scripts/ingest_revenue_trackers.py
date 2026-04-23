#!/usr/bin/env python3
"""
Ingest TAGGD-style revenue Excel templates into weekly forecast + visibility tables.

Files (read sheet layouts before changing column logic):
  - excel_files_imp/Revenue_Forecast_Template_1.xlsx  → sheet "Revenue Forecast Data"
  - excel_files_imp/Revenue_Visibility_Tracker.xlsx   → sheet "Revenue Tracker" (header auto-detected rows 0–4)

Money columns in these templates are stored as full INR amounts (not Lakhs scalars),
matching RevenueForecastWeekly.*_inr / RevenueVisibilitySnapshot.*_inr in the DB.

Project names are resolved via backend.core.sla_project_resolve plus MANUAL_ACCOUNT_BY_SHEET_NORM.

Optional weekly governance (revenue pack queue + both tracker tabs):
  - --apply-governance --governance-user admin@test.local
  - Creates/updates `revenue_weekly_submission` with status `approved` (submitted/reviewed/approved by that user)
  - Sets `weekly_submission_id` on `revenue_forecast_weekly` and synthetic `revenue_visibility_snapshot` built from
    the same forecast row (as-of = Update Date) when using --forecast-only. If you also pass a visibility workbook,
    that sheet replaces/augments visibility rows instead of synthetic snapshots from forecast.

Usage (repo root):
  python3 -m backend.scripts.ingest_revenue_trackers
  python3 -m backend.scripts.ingest_revenue_trackers --dry-run
  python3 -m backend.scripts.ingest_revenue_trackers --forecast path.xlsx --visibility path2.xlsx
  python3 -m backend.scripts.ingest_revenue_trackers --forecast path.xlsx --forecast-only \\
      --apply-governance --governance-user admin@test.local
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
from typing import Any, Optional

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.revenue_weekly_submission_core import ST_APPROVED
from backend.core.sla_project_resolve import _norm_key, resolve_project_for_sla
from backend.db.database import (
    Project,
    RevenueForecastWeekly,
    RevenueVisibilitySnapshot,
    RevenueWeeklySubmission,
    SessionLocal,
    User,
    init_db,
)

# Sheet label (normalized) → canonical Project.account_name in DB (explicit overrides)
MANUAL_ACCOUNT_BY_SHEET_NORM: dict[str, str] = {
    # Template combines Advanta+GBS; DB has separate SBUs — default mapping (edit if policy changes)
    "siemens (advatnta & gbs)": "Siemens - Advanta",
    "hyundai leadership": "Hyundai Motor Leadership",
}


def _repo_default_forecast() -> str:
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../excel_files_imp/Revenue_Forecast_Template_1.xlsx")
    )


def _repo_default_visibility() -> str:
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../excel_files_imp/Revenue_Visibility_Tracker.xlsx")
    )


def _valid_label(x: Any) -> bool:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return False
    s = str(x).strip()
    if not s or s.lower() == "nan":
        return False
    if s.startswith("*"):
        return False
    low = s.lower()
    if "mandatory" in low or "manadatory" in low:
        return False
    if "instructions" in low or "week start and end" in low:
        return False
    if low in ("total", "exclusive", "subtotal", "grand total"):
        return False
    if "total" == low or low.startswith("total "):
        return False
    return True


def _to_dt(val: Any) -> Optional[dt.datetime]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, dt.datetime):
        return val.replace(hour=0, minute=0, second=0, microsecond=0)
    if isinstance(val, dt.date):
        return dt.datetime(val.year, val.month, val.day)
    ts = pd.to_datetime(val, errors="coerce")
    if pd.isna(ts):
        return None
    t = ts.to_pydatetime()
    return dt.datetime(t.year, t.month, t.day, 0, 0, 0)


def _inr(val: Any) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _intn(val: Any) -> int:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def _week_number_from_label(raw: Any) -> Optional[int]:
    s = str(raw or "").strip().lower()
    m = re.search(r"week\s*(\d+)", s)
    if m:
        return int(m.group(1))
    m = re.search(r"^w\s*(\d+)$", s)
    if m:
        return int(m.group(1))
    return None


def _monday_of_nth_week_in_month(month_anchor: dt.datetime, week_n: int) -> dt.datetime:
    """Week 1 = first Monday on or after the 1st of the anchor month (TAGGD-style)."""
    d = dt.date(month_anchor.year, month_anchor.month, 1)
    while d.weekday() != 0:  # Monday
        d += dt.timedelta(days=1)
    d = d + dt.timedelta(weeks=max(0, week_n - 1))
    return dt.datetime(d.year, d.month, d.day, 0, 0, 0)


def _achievement_pct(raw: Any) -> Optional[float]:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    # Ratio ~1.0 → percent; values already on 0–100 scale stay as-is
    if -0.01 <= v <= 2.0:
        return v * 100.0
    return v


def _resolve_project(db: Session, sheet_label: str) -> tuple[Optional[Project], str]:
    nk = _norm_key(sheet_label)
    if nk in MANUAL_ACCOUNT_BY_SHEET_NORM:
        target = MANUAL_ACCOUNT_BY_SHEET_NORM[nk]
        p = db.query(Project).filter(Project.account_name == target).first()
        if p:
            return p, "manual_alias"
    return resolve_project_for_sla(db, sheet_label)


def _get_or_create_weekly_submission(
    db: Session, project_id: int, week_start: dt.datetime
) -> RevenueWeeklySubmission:
    sub = (
        db.query(RevenueWeeklySubmission)
        .filter(
            RevenueWeeklySubmission.project_id == project_id,
            RevenueWeeklySubmission.week_start_date == week_start,
            RevenueWeeklySubmission.period_type == "weekly",
        )
        .first()
    )
    if sub:
        return sub
    sub = RevenueWeeklySubmission(
        project_id=project_id,
        week_start_date=week_start,
        period_type="weekly",
        status="draft",
    )
    db.add(sub)
    db.flush()
    return sub


def _apply_approved_governance_pack(
    db: Session, sub: RevenueWeeklySubmission, user_id: int, when: dt.datetime
) -> None:
    sub.status = ST_APPROVED
    sub.submitted_by_user_id = user_id
    sub.submitted_at = when
    sub.reviewed_by_user_id = user_id
    sub.reviewed_at = when
    sub.approved_by_user_id = user_id
    sub.approved_at = when
    sub.review_notes = None


def _synthetic_status_from_forecast(row_fc: RevenueForecastWeekly) -> str:
    ach = row_fc.achievement_pct
    if ach is None:
        return "—"
    if ach >= 99.0:
        return "On Track"
    if ach >= 80.0:
        return "Watch"
    return "At Risk"


def _upsert_synthetic_visibility_for_pack(
    db: Session,
    project: Project,
    row_fc: RevenueForecastWeekly,
    submission_id: int,
    user_id: int,
) -> None:
    """Build a visibility snapshot from the weekly forecast row (same week / as-of update date)."""
    as_of = row_fc.update_date or row_fc.week_start_date
    vis = (
        db.query(RevenueVisibilitySnapshot)
        .filter(
            RevenueVisibilitySnapshot.project_id == project.id,
            RevenueVisibilitySnapshot.as_of_date == as_of,
        )
        .first()
    )
    if not vis:
        vis = RevenueVisibilitySnapshot(project_id=project.id, as_of_date=as_of)
        db.add(vis)
    ph = (project.practice_head or project.be_spoc or "").strip() or None
    vis.practice_head = ph
    vis.mmf_inr = float(row_fc.mmf_inr or 0.0)
    vis.open_req = int(row_fc.open_req or 0)
    vis.opening_fee_inr = float(row_fc.open_fee_inr or 0.0)
    vis.joiners_as_on_date = int(row_fc.joiner_count or 0)
    vis.joining_fee_inr = float(row_fc.joiner_fee_inr or 0.0)
    vis.yet_to_join = int(row_fc.to_be_offer_count or 0)
    vis.ytj_fee_inr = float(row_fc.to_be_offer_fee_inr or 0.0)
    vis.gap_to_mmf_inr = max(0.0, float(vis.mmf_inr) - float(vis.joining_fee_inr or 0.0))
    ach = row_fc.achievement_pct
    if ach is not None:
        vis.revenue_realised_pct = float(ach)  # template % is same ballpark
    else:
        vis.revenue_realised_pct = None
    vis.conversion_rate_pct = None
    vis.status = _synthetic_status_from_forecast(row_fc)
    vis.entered_by_user_id = user_id
    vis.weekly_submission_id = submission_id
    db.flush()


def ingest_forecast_template(
    path: str,
    db: Session,
    *,
    dry_run: bool,
    governance_user_id: Optional[int] = None,
    synthetic_visibility: bool = True,
) -> dict[str, Any]:
    df = pd.read_excel(path, sheet_name="Revenue Forecast Data", header=2)
    updated = 0
    skipped = 0
    governance_linked = 0
    synthetic_vis_n = 0
    pack_when = dt.datetime.utcnow().replace(microsecond=0)
    unmapped: list[str] = []
    for _, row in df.iterrows():
        name = row.get("Project Name")
        if not _valid_label(name):
            skipped += 1
            continue
        project, _reason = _resolve_project(db, str(name).strip())
        if not project:
            unmapped.append(str(name).strip())
            skipped += 1
            continue

        month_anchor = _to_dt(row.get("Month"))
        if not month_anchor:
            skipped += 1
            continue
        wn = _week_number_from_label(row.get("Week"))
        if not wn:
            skipped += 1
            continue
        week_start = _monday_of_nth_week_in_month(month_anchor, wn)
        upd = _to_dt(row.get("Update Date")) or dt.datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        week_label = str(row.get("Week") or "").strip() or None

        if dry_run:
            updated += 1
            continue

        row_fc = (
            db.query(RevenueForecastWeekly)
            .filter(
                RevenueForecastWeekly.project_id == project.id,
                RevenueForecastWeekly.week_start_date == week_start,
            )
            .first()
        )
        if not row_fc:
            row_fc = RevenueForecastWeekly(
                project_id=project.id,
                week_start_date=week_start,
                month_anchor=month_anchor,
                update_date=upd,
            )
            db.add(row_fc)

        row_fc.week_label = week_label
        row_fc.month_anchor = month_anchor
        row_fc.update_date = upd
        row_fc.revenue_forecast_inr = _inr(row.get("Revenue Forecast\n(₹ Lakhs)"))
        row_fc.adjustment_inr = _inr(row.get("Adjustment\n (If Any)"))
        row_fc.penalty_inr = _inr(row.get("Penalty\n (If Any)"))
        row_fc.bad_debts_inr = _inr(row.get("Bad Debts\n (If Any)"))
        row_fc.mmf_inr = _inr(row.get("MMF\n(₹ Lakhs)"))
        row_fc.open_fee_inr = _inr(row.get("Open Fee\n(₹ Lakhs)"))
        row_fc.joiner_fee_inr = _inr(row.get("Joiner Fee\n(₹ Lakhs)"))
        row_fc.to_be_offer_fee_inr = _inr(row.get("To Be Offer\n(₹ Lakhs)"))
        row_fc.net_revenue_inr = _inr(row.get("Net Revenue"))
        row_fc.open_req = _intn(row.get("Open Req\n(#)"))
        row_fc.joiner_count = _intn(row.get("Joiner\n(#)"))
        row_fc.to_be_offer_count = _intn(row.get("To Be Offer"))
        row_fc.achievement_pct = _achievement_pct(row.get("Achievement %\n(Joiner Fee / Rev Fcst)"))
        remarks = row.get("Remarks")
        if remarks is not None and not (isinstance(remarks, float) and pd.isna(remarks)):
            s = str(remarks).strip()
            row_fc.remarks = s if s and s.lower() != "nan" else None
        if governance_user_id is not None and not dry_run:
            sub = _get_or_create_weekly_submission(db, project.id, week_start)
            _apply_approved_governance_pack(db, sub, governance_user_id, pack_when)
            row_fc.weekly_submission_id = sub.id
            row_fc.entered_by_user_id = governance_user_id
            if synthetic_visibility:
                _upsert_synthetic_visibility_for_pack(
                    db, project, row_fc, sub.id, governance_user_id
                )
                synthetic_vis_n += 1
            governance_linked += 1
        db.flush()
        updated += 1

    return {
        "sheet": "Revenue Forecast Data",
        "rows_upserted": updated,
        "rows_skipped": skipped,
        "governance_approved_packs": governance_linked,
        "synthetic_visibility_rows": synthetic_vis_n,
        "unmapped_project_names": sorted(set(unmapped)),
    }


def _clean_status(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    # Keep text after emoji if any
    return re.sub(r"^[\U0001F300-\U0001FAFF\s]+", "", s).strip() or s


def _read_revenue_tracker_sheet(path: str) -> tuple[pd.DataFrame, int]:
    """Pick header row for sheet \"Revenue Tracker\" (template adds/removes title rows)."""
    expected = {"project\nname", "updated\ndate"}
    for header in (2, 1, 3, 4, 0):
        df = pd.read_excel(path, sheet_name="Revenue Tracker", header=header)
        cols = {str(c).strip().lower() for c in df.columns if str(c).strip()}
        if expected.issubset(cols):
            return df, header
    df0 = pd.read_excel(path, sheet_name="Revenue Tracker", header=2)
    raise ValueError(
        "Revenue Tracker sheet: could not find columns Project Name and Updated Date "
        f"(tried header rows 0–4). Got columns: {list(df0.columns)[:20]}"
    )


def ingest_visibility_tracker(path: str, db: Session, *, dry_run: bool) -> dict[str, Any]:
    df, header_row = _read_revenue_tracker_sheet(path)
    updated = 0
    skipped = 0
    unmapped: list[str] = []
    for _, row in df.iterrows():
        name = row.get("Project\nName")
        if not _valid_label(name):
            skipped += 1
            continue
        project, _reason = _resolve_project(db, str(name).strip())
        if not project:
            unmapped.append(str(name).strip())
            skipped += 1
            continue

        as_of = _to_dt(row.get("Updated\nDate"))
        if not as_of:
            skipped += 1
            continue

        if dry_run:
            updated += 1
            continue

        vis = (
            db.query(RevenueVisibilitySnapshot)
            .filter(
                RevenueVisibilitySnapshot.project_id == project.id,
                RevenueVisibilitySnapshot.as_of_date == as_of,
            )
            .first()
        )
        if not vis:
            vis = RevenueVisibilitySnapshot(project_id=project.id, as_of_date=as_of)
            db.add(vis)

        ph = row.get("PH Name")
        if ph is not None and not (isinstance(ph, float) and pd.isna(ph)):
            pht = str(ph).strip()
            vis.practice_head = pht if pht and pht.lower() != "nan" else None
        vis.mmf_inr = _inr(row.get("MMF\n(₹)"))
        vis.open_req = _intn(row.get("Open\nReq"))
        vis.opening_fee_inr = _inr(row.get("Opening\nFee (₹)"))
        # Column is mis-labelled in template; coerce numeric joiner count
        vis.joiners_as_on_date = _intn(row.get("Joiners\nas on Date"))
        vis.joining_fee_inr = _inr(row.get("Joining\nFee (₹)"))
        vis.yet_to_join = _intn(row.get("Yet to\nJoin"))
        vis.ytj_fee_inr = _inr(row.get("YTJ Fee\n(₹)"))
        cr = row.get("Conversion\nRate %")
        if cr is not None and not (isinstance(cr, float) and pd.isna(cr)):
            try:
                vis.conversion_rate_pct = float(cr)
            except (TypeError, ValueError):
                vis.conversion_rate_pct = None
        rr = row.get("Revenue\nRealised %")
        if rr is not None and not (isinstance(rr, float) and pd.isna(rr)):
            try:
                vis.revenue_realised_pct = float(rr)
            except (TypeError, ValueError):
                vis.revenue_realised_pct = None
        vis.gap_to_mmf_inr = _inr(row.get("Gap to\nMMF (₹)"))
        st = row.get("Status")
        if st is not None and not (isinstance(st, float) and pd.isna(st)):
            vis.status = _clean_status(str(st))
        db.flush()
        updated += 1

    return {
        "sheet": "Revenue Tracker",
        "excel_header_row": header_row,
        "rows_upserted": updated,
        "rows_skipped": skipped,
        "unmapped_project_names": sorted(set(unmapped)),
    }


def ingest_revenue_workbooks(
    forecast_path: Optional[str],
    visibility_path: Optional[str],
    db: Optional[Session] = None,
    *,
    dry_run: bool = False,
    governance_user_id: Optional[int] = None,
    synthetic_visibility_from_forecast: bool = True,
) -> dict[str, Any]:
    if not forecast_path and not visibility_path:
        raise ValueError("At least one of forecast_path or visibility_path is required")
    own = db is None
    if own:
        init_db()
        db = SessionLocal()
    out: dict[str, Any] = {"ok": False, "dry_run": dry_run}
    # When a real visibility workbook is also ingested, skip auto snapshots from forecast
    # (avoids double-write); use forecast-only + --apply-governance for template-only data.
    synthetic_from_fc = bool(synthetic_visibility_from_forecast and not visibility_path)
    try:
        if forecast_path:
            out["forecast"] = ingest_forecast_template(
                forecast_path,
                db,
                dry_run=dry_run,
                governance_user_id=governance_user_id,
                synthetic_visibility=synthetic_from_fc and governance_user_id is not None,
            )
        if visibility_path:
            out["visibility"] = ingest_visibility_tracker(visibility_path, db, dry_run=dry_run)
        if not dry_run:
            db.commit()
        out["ok"] = True
        return out
    except Exception:
        if not dry_run:
            db.rollback()
        raise
    finally:
        if own:
            db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest revenue forecast + visibility Excel templates")
    ap.add_argument("--forecast", default=_repo_default_forecast(), help="Path to Revenue_Forecast_Template*.xlsx")
    ap.add_argument(
        "--visibility",
        default=_repo_default_visibility(),
        help="Path to Revenue_Visibility_Tracker.xlsx (not required with --forecast-only)",
    )
    ap.add_argument("--forecast-only", action="store_true", help="Ingest only the forecast workbook (no visibility file)")
    ap.add_argument(
        "--apply-governance",
        action="store_true",
        help="For each row: set revenue_weekly_submission to approved with --governance-user; "
        "link forecast/visibility; build visibility from forecast (unless a visibility file is also loaded).",
    )
    ap.add_argument(
        "--governance-user",
        default="admin@test.local",
        help="User email for submitted_by / approved_by / entered_by (requires --apply-governance)",
    )
    ap.add_argument(
        "--no-synthetic-visibility",
        action="store_true",
        help="With --apply-governance and --forecast-only, do not build revenue_visibility_snapshot from forecast",
    )
    ap.add_argument("--dry-run", action="store_true", help="Parse and resolve only; no DB writes")
    args = ap.parse_args()
    if not os.path.isfile(args.forecast):
        raise SystemExit(f"Missing forecast file: {args.forecast}")
    if args.forecast_only:
        vis: Optional[str] = None
    else:
        vis = args.visibility
        if not os.path.isfile(vis or ""):
            raise SystemExit(f"Missing visibility file: {vis}")
    init_db()
    dbl = SessionLocal()
    try:
        g_uid: Optional[int] = None
        if args.apply_governance:
            em = (args.governance_user or "").strip().lower()
            u = dbl.query(User).filter(func.lower(User.email) == em).first()
            if not u:
                raise SystemExit(
                    f"No user with email {args.governance_user!r}. Create the user first, then re-run."
                )
            g_uid = u.id
    finally:
        dbl.close()
    r = ingest_revenue_workbooks(
        args.forecast,
        vis,
        db=None,
        dry_run=args.dry_run,
        governance_user_id=g_uid,
        synthetic_visibility_from_forecast=not args.no_synthetic_visibility,
    )
    print(r)


if __name__ == "__main__":
    main()
