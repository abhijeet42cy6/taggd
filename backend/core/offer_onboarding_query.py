"""Query helpers for Offer & Onboarding list views and KPI summaries."""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from backend.db.database import Candidate, Record

_RISK_WATCH_MARKERS = ("watch", "🟡", "amber", "medium")
_RISK_HIGH_MARKERS = ("high", "🔴", "red", "dropped", "critical")


def _norm_stage(val: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (val or "").strip().lower())


def candidate_has_offer_onboarding_signal(c: Candidate) -> bool:
    """True when row should appear on the Offer & Onboarding tab."""
    if c.offer_date is not None:
        return True
    if c.offer_ctc_lpa is not None and float(c.offer_ctc_lpa) > 0:
        return True
    if (c.offer_accepted_flag or "").strip():
        return True
    if (c.joining_status or "").strip():
        return True
    if c.expected_doj is not None:
        return True
    st = _norm_stage(c.current_stage)
    if any(x in st for x in ("offer", "ytj", "join")):
        return True
    return False


def apply_offer_onboarding_filter(q: Query) -> Query:
    """Restrict to candidates with offer/joining/onboarding signals."""
    stage = func.lower(func.coalesce(Candidate.current_stage, ""))
    return q.filter(
        or_(
            Candidate.offer_date.isnot(None),
            (Candidate.offer_ctc_lpa.isnot(None)) & (Candidate.offer_ctc_lpa > 0),
            func.length(func.trim(func.coalesce(Candidate.offer_accepted_flag, ""))) > 0,
            func.length(func.trim(func.coalesce(Candidate.joining_status, ""))) > 0,
            Candidate.expected_doj.isnot(None),
            stage.like("%offer%"),
            stage.like("%ytj%"),
            stage.like("%join%"),
        )
    )


def enrich_candidate_with_record_context(
    payload: dict[str, Any],
    record: Optional[Record],
) -> dict[str, Any]:
    if record is None:
        payload.setdefault("client_req_id", None)
        payload.setdefault("position_title", None)
        payload.setdefault("rpo_client_name", None)
        return payload
    payload["client_req_id"] = record.client_req_id
    payload["position_title"] = record.position_title
    payload["rpo_client_name"] = record.rpo_client_name
    return payload


def excel_candidate_id_from_row(c: Candidate) -> Optional[str]:
    extras = c.candidate_extras if isinstance(c.candidate_extras, dict) else {}
    for key in ("excel_candidate_id", "Cand. ID", "Cand ID", "Candidate ID"):
        val = extras.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def _is_risk_watch(val: Optional[str]) -> bool:
    s = _norm_stage(val)
    if not s:
        return False
    return any(m in s for m in _RISK_WATCH_MARKERS)


def _is_risk_high(val: Optional[str]) -> bool:
    s = _norm_stage(val)
    if not s:
        return False
    return any(m in s for m in _RISK_HIGH_MARKERS)


def _accepted_flag(val: Optional[str]) -> bool:
    s = _norm_stage(val)
    return s in ("yes", "y", "accepted", "true", "1") or "accept" in s


def _pending_checkin(val: Optional[str]) -> bool:
    s = _norm_stage(val)
    return not s or s in ("pending", "—", "-", "na", "n/a", "todo", "due")


def summarize_offer_onboarding_rows(rows: list[Candidate], *, today: Optional[dt.date] = None) -> dict[str, Any]:
    """Aggregate KPIs for the Offer & Onboarding tab."""
    today = today or dt.date.today()
    total = len(rows)
    open_offers = 0
    accepted_pending_doj = 0
    joined = 0
    at_risk = 0
    overdue_checkins = 0

    for c in rows:
        if c.actual_doj is not None:
            joined += 1
        elif _accepted_flag(c.offer_accepted_flag) or (c.offer_acceptance or "").strip():
            if c.expected_doj is not None:
                accepted_pending_doj += 1
            else:
                open_offers += 1
        elif c.offer_date is not None or (c.offer_ctc_lpa or 0) > 0:
            open_offers += 1

        if _is_risk_watch(c.early_exit_risk) or _is_risk_high(c.early_exit_risk):
            at_risk += 1

        if c.actual_doj is not None:
            days_since = (today - c.actual_doj.date()).days if hasattr(c.actual_doj, "date") else 0
            if days_since >= 30 and _pending_checkin(c.checkin_30_day):
                overdue_checkins += 1
            elif days_since >= 60 and _pending_checkin(c.checkin_60_day):
                overdue_checkins += 1
            elif days_since >= 90 and _pending_checkin(c.checkin_90_day):
                overdue_checkins += 1

    acceptance_base = sum(1 for c in rows if _accepted_flag(c.offer_accepted_flag) or (c.decline_reason or "").strip())
    accepted = sum(1 for c in rows if _accepted_flag(c.offer_accepted_flag))
    declined = sum(1 for c in rows if (c.decline_reason or "").strip())
    offer_accept_rate = round(accepted / (accepted + declined) * 100, 1) if (accepted + declined) > 0 else None

    return {
        "total": total,
        "open_offers": open_offers,
        "accepted_pending_doj": accepted_pending_doj,
        "joined": joined,
        "at_risk": at_risk,
        "overdue_checkins": overdue_checkins,
        "offer_accept_rate_pct": offer_accept_rate,
    }


def summarize_offer_onboarding(db: Session, q: Query) -> dict[str, Any]:
    rows = q.all()
    return summarize_offer_onboarding_rows(rows)
