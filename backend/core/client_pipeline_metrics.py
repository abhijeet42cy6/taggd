"""Client portal requisition pipeline metrics — snapshot + activity period aggregates."""
from __future__ import annotations

import calendar
import datetime as dt
import statistics
from typing import Any, Optional

from backend.db.database import Project, Record

_WIP_STATUSES = frozenset({"ACTIVE", "PIPELINE", "ON HOLD", "UNPROCESSED"})
_TERMINAL_STATUSES = frozenset({"CLOSED", "CANCELLED"})
_YTJ_MARKERS = ("yet to join", "ytj")
_OFFER_DROP_MARKERS = ("offered drop", "offer drop")
_DIVERSITY_FEMALE = frozenset({"female", "f"})
_RPO_SOURCE = "taggd_rpo"


def _norm_gs(raw: Optional[str]) -> str:
    return (raw or "").strip().upper()


def _norm_status(raw: Optional[str]) -> str:
    return (raw or "").strip().lower()


def _read_diversity(attrs: Any) -> str:
    if not isinstance(attrs, dict):
        return ""
    raw = attrs.get("diversity") or attrs.get("Diversity") or attrs.get("gender")
    return str(raw).strip() if raw is not None else ""


def _is_offer_signal(r: Record) -> bool:
    gs = _norm_gs(r.global_status)
    st = _norm_status(r.status)
    if gs == "PIPELINE" and "offer" in st:
        return True
    if "offer" in st:
        return True
    if r.req_offered_date is not None:
        return True
    if r.offered_ctc is not None and float(r.offered_ctc) > 0:
        return True
    return False


def _is_open_req(r: Record) -> bool:
    gs = _norm_gs(r.global_status)
    if gs != "ACTIVE":
        return False
    return "offer" not in _norm_status(r.status)


def _is_wip(r: Record) -> bool:
    gs = _norm_gs(r.global_status)
    return gs in _WIP_STATUSES


def _is_joiner(r: Record, today: dt.date) -> bool:
    gs = _norm_gs(r.global_status)
    if gs == "CLOSED":
        return True
    if r.joining_date is not None:
        jd = r.joining_date.date() if isinstance(r.joining_date, dt.datetime) else r.joining_date
        return jd <= today
    return False


def _is_ytj(r: Record, today: dt.date) -> bool:
    cn = _norm_status(r.candidate_name)
    if any(m in cn for m in _YTJ_MARKERS):
        return True
    if r.joining_date is not None:
        jd = r.joining_date.date() if isinstance(r.joining_date, dt.datetime) else r.joining_date
        return jd > today
    st = _norm_status(r.status)
    return "yet to join" in st or st == "ytj"


def _is_offer_drop(r: Record) -> bool:
    cn = _norm_status(r.candidate_name)
    if any(m in cn for m in _OFFER_DROP_MARKERS):
        return True
    st = _norm_status(r.status)
    return "drop" in st and "offer" in st


def _as_date(val: Any) -> Optional[dt.date]:
    if val is None:
        return None
    if isinstance(val, dt.datetime):
        return val.date()
    if isinstance(val, dt.date):
        return val
    return None


def _days_between(start: Optional[dt.date], end: Optional[dt.date]) -> Optional[int]:
    if start is None or end is None:
        return None
    return (end - start).days


def _median(vals: list[int]) -> Optional[float]:
    if not vals:
        return None
    return round(float(statistics.median(vals)), 1)


def _mean(vals: list[int]) -> Optional[float]:
    if not vals:
        return None
    return round(float(statistics.mean(vals)), 1)


def _pct_delta(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    if cur is None or prev is None or prev == 0:
        return None
    return round((cur - prev) / prev * 100, 1)


def _month_bounds(anchor: str) -> tuple[dt.date, dt.date]:
    """YYYY-MM → [first day, last day]."""
    y, m = int(anchor[:4]), int(anchor[5:7])
    last = calendar.monthrange(y, m)[1]
    return dt.date(y, m, 1), dt.date(y, m, last)


def _quarter_bounds(anchor: str) -> tuple[dt.date, dt.date]:
    """YYYY-Qn → [first day, last day]."""
    y = int(anchor[:4])
    q = int(anchor.split("-Q")[1]) if "-Q" in anchor.upper() else 1
    q = max(1, min(4, q))
    start_m = (q - 1) * 3 + 1
    end_m = start_m + 2
    last = calendar.monthrange(y, end_m)[1]
    return dt.date(y, start_m, 1), dt.date(y, end_m, last)


def _prior_period(start: dt.date, end: dt.date, granularity: str) -> tuple[dt.date, dt.date]:
    if granularity == "quarter":
        months_span = (end.year - start.year) * 12 + (end.month - start.month) + 1
        prior_end = start - dt.timedelta(days=1)
        prior_start_month = prior_end.month - months_span + 1
        y = prior_end.year
        while prior_start_month <= 0:
            prior_start_month += 12
            y -= 1
        return dt.date(y, prior_start_month, 1), prior_end
    # month
    if start.month == 1:
        return dt.date(start.year - 1, 12, 1), dt.date(start.year - 1, 12, 31)
    pm = start.month - 1
    last = calendar.monthrange(start.year, pm)[1]
    return dt.date(start.year, pm, 1), dt.date(start.year, pm, last)


def _in_range(d: Optional[dt.date], start: dt.date, end: dt.date) -> bool:
    if d is None:
        return False
    return start <= d <= end


def _in_range_flexible(
    d: Optional[dt.date],
    start: Optional[dt.date],
    end: Optional[dt.date],
) -> bool:
    if d is None:
        return False
    if start and end:
        return start <= d <= end
    if start:
        return d >= start
    if end:
        return d <= end
    return True


def _parse_iso_date(raw: Optional[str]) -> Optional[dt.date]:
    if not raw or not str(raw).strip():
        return None
    try:
        return dt.date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        return None


def _is_cancelled(r: Record) -> bool:
    gs = _norm_gs(r.global_status)
    if gs == "CANCELLED":
        return True
    if _as_date(r.req_cancelled_date) is not None:
        return True
    st = _norm_status(r.status)
    return "cancel" in st


def _is_hold(r: Record) -> bool:
    gs = _norm_gs(r.global_status)
    if gs == "ON HOLD":
        return True
    st = _norm_status(r.status)
    return "hold" in st or st == "on hold"


def _source_label(raw: Optional[str]) -> str:
    src = (raw or "").strip()
    if not src:
        return "Unknown"
    low = src.lower()
    if low == "taggd_rpo":
        return "Taggd RPO"
    if low == "taggd_direct":
        return "Taggd Direct"
    if low.startswith("nontaggd_"):
        return src.replace("nontaggd_", "Non-Taggd ").replace("_", " ").title()
    return src


def _hire_source_label(r: Record) -> str:
    raw = (r.rpo_source_of_hire or "").strip()
    if raw:
        return raw
    return _source_label(r.source_joiner_type)


PIPELINE_FILTER_KEYS = (
    "business_unit",
    "division",
    "sbg",
    "sbu",
    "bhr",
    "band",
)


def empty_pipeline_filter_options() -> dict[str, list[str]]:
    return {k: [] for k in PIPELINE_FILTER_KEYS}


def _scope_has_record_sbu(records: list[Record]) -> bool:
    """True when any requisition in scope carries a req-level SBU (`rpo_bu_sbu`)."""
    return any((r.rpo_bu_sbu or "").strip() for r in records)


def _record_sbu_value(r: Record, proj: Optional[Project]) -> str:
    """Effective SBU for filtering: req field when populated, else project tag."""
    rec_sbu = (r.rpo_bu_sbu or "").strip()
    if rec_sbu:
        return rec_sbu
    if proj:
        return (proj.hierarchy_tag_sbu or "").strip()
    return ""


def collect_pipeline_filter_options(
    projects: list[Project],
    records: list[Record],
) -> dict[str, list[str]]:
    """Distinct filter values for the current client / project scope."""
    bu: set[str] = set()
    sbg: set[str] = set()
    sbu_project: set[str] = set()
    division: set[str] = set()
    bhr: set[str] = set()
    band: set[str] = set()
    sbu_record: set[str] = set()

    for p in projects:
        if v := (p.hierarchy_tag_bu or "").strip():
            bu.add(v)
        if v := (p.hierarchy_tag_sbg or "").strip():
            sbg.add(v)
        if v := (p.hierarchy_tag_sbu or "").strip():
            sbu_project.add(v)

    for r in records:
        if v := (r.rpo_division or "").strip():
            division.add(v)
        if v := (r.rpo_business_hrbp or "").strip():
            bhr.add(v)
        if v := (r.rpo_grade_band or "").strip():
            band.add(v)
        if v := (r.rpo_bu_sbu or "").strip():
            sbu_record.add(v)

    # When reqs carry SBU, dropdown uses req-level values only (avoids geographic project tags).
    sbu = sbu_record if _scope_has_record_sbu(records) else sbu_project
    return {
        "business_unit": sorted(bu, key=str.lower),
        "division": sorted(division, key=str.lower),
        "sbg": sorted(sbg, key=str.lower),
        "sbu": sorted(sbu, key=str.lower),
        "bhr": sorted(bhr, key=str.lower),
        "band": sorted(band, key=str.lower),
    }


# Backward-compatible alias
def collect_filter_options(records: list[Record]) -> dict[str, list[str]]:
    return collect_pipeline_filter_options([], records)


def _project_for_record(
    r: Record,
    projects_by_id: dict[int, Project],
) -> Optional[Project]:
    if r.project_id is None:
        return None
    return projects_by_id.get(int(r.project_id))


def filter_pipeline_records(
    records: list[Record],
    projects_by_id: Optional[dict[int, Project]] = None,
    *,
    business_unit: Optional[str] = None,
    division: Optional[str] = None,
    sbg: Optional[str] = None,
    sbu: Optional[str] = None,
    bhr: Optional[str] = None,
    band: Optional[str] = None,
    rpo_vertical: Optional[str] = None,
    rpo_division: Optional[str] = None,
    rpo_bu_sbu: Optional[str] = None,
    rpo_zone: Optional[str] = None,
    rpo_grade_band: Optional[str] = None,
    rpo_business_hrbp: Optional[str] = None,
    req_created_from: Optional[dt.date] = None,
    req_created_to: Optional[dt.date] = None,
    offer_from: Optional[dt.date] = None,
    offer_to: Optional[dt.date] = None,
    join_from: Optional[dt.date] = None,
    join_to: Optional[dt.date] = None,
) -> list[Record]:
    projects_by_id = projects_by_id or {}
    bu_f = (business_unit or "").strip()
    div_f = (division or rpo_division or "").strip()
    sbg_f = (sbg or "").strip()
    sbu_f = (sbu or rpo_bu_sbu or "").strip()
    bhr_f = (bhr or rpo_business_hrbp or "").strip()
    band_f = (band or rpo_grade_band or "").strip()

    has_req = req_created_from is not None or req_created_to is not None
    has_offer = offer_from is not None or offer_to is not None
    has_join = join_from is not None or join_to is not None
    has_date = has_req or has_offer or has_join

    out: list[Record] = []
    for r in records:
        proj = _project_for_record(r, projects_by_id)

        if bu_f and (not proj or (proj.hierarchy_tag_bu or "").strip() != bu_f):
            continue
        if sbg_f and (not proj or (proj.hierarchy_tag_sbg or "").strip() != sbg_f):
            continue
        if sbu_f:
            if _record_sbu_value(r, proj) != sbu_f:
                continue
        if div_f and (r.rpo_division or "").strip() != div_f:
            continue
        if bhr_f and (r.rpo_business_hrbp or "").strip() != bhr_f:
            continue
        if band_f and (r.rpo_grade_band or "").strip() != band_f:
            continue

        # Legacy optional record filters
        if rpo_vertical and str(rpo_vertical).strip():
            if (r.rpo_vertical or "").strip() != str(rpo_vertical).strip():
                continue
        if rpo_zone and str(rpo_zone).strip():
            if (r.rpo_zone or "").strip() != str(rpo_zone).strip():
                continue

        if has_date:
            created = _as_date(r.creation_date)
            offer_dt = _as_date(r.offered_accept_date) or _as_date(r.req_offered_date)
            join_dt = _as_date(r.joining_date)
            matched = False
            if has_req and _in_range_flexible(created, req_created_from, req_created_to):
                matched = True
            if has_offer and _in_range_flexible(offer_dt, offer_from, offer_to):
                matched = True
            if has_join and _in_range_flexible(join_dt, join_from, join_to):
                matched = True
            if not matched:
                continue
        out.append(r)
    return out


def _empty_bucket() -> dict[str, Any]:
    return {
        "wip": 0,
        "open": 0,
        "offered": 0,
        "ytj": 0,
        "joiners": 0,
        "offer_drops": 0,
        "avg_ageing_days": None,
        "median_ageing_days": None,
        "avg_tto_days": None,
        "median_tto_days": None,
        "avg_ttf_days": None,
        "median_ttf_days": None,
        "diversity_pct": None,
        "rpo_mix_pct": None,
        "offer_drop_pct": None,
        "cancelled": 0,
        "hold": 0,
        "total_demand": 0,
        "oar_pct": None,
        "jcr_pct": None,
        "coverage": {
            "joiners": 0,
            "with_diversity": 0,
            "with_source": 0,
            "with_offer_date": 0,
            "with_creation_date": 0,
        },
    }


def _compute_snapshot(records: list[Record], today: dt.date) -> dict[str, Any]:
    out = _empty_bucket()
    ageing_vals: list[int] = []
    tto_vals: list[int] = []
    ttf_vals: list[int] = []
    female_joiners = 0
    rpo_joiners = 0
    total_joiners = 0
    offered_count = 0
    offer_drops = 0

    cancelled = 0
    hold = 0
    accepted_offers = 0

    for r in records:
        gs = _norm_gs(r.global_status)
        created = _as_date(r.creation_date)

        if _is_cancelled(r):
            cancelled += 1
        if _is_hold(r):
            hold += 1

        if _is_wip(r):
            out["wip"] += 1
        if _is_open_req(r):
            out["open"] += 1
        if _is_offer_signal(r) and gs != "CLOSED":
            out["offered"] += 1
        if _is_ytj(r, today):
            out["ytj"] += 1

        if _is_offer_signal(r):
            offered_count += 1
        if _as_date(r.offered_accept_date) or (r.offers_accepted or 0) > 0:
            accepted_offers += 1
        if _is_offer_drop(r):
            offer_drops += 1
            out["offer_drops"] += 1

        if gs != "CLOSED" and created is not None:
            days = (today - created).days
            if days >= 0:
                ageing_vals.append(days)

        offered_dt = _as_date(r.req_offered_date)
        if offered_dt and created:
            d = _days_between(created, offered_dt)
            if d is not None and d >= 0:
                tto_vals.append(d)
                out["coverage"]["with_offer_date"] += 1

        if _is_joiner(r, today):
            total_joiners += 1
            out["joiners"] += 1
            if created:
                jd = _as_date(r.joining_date) or today
                d = _days_between(created, jd)
                if d is not None and d >= 0:
                    ttf_vals.append(d)

            div = _read_diversity(r.additional_attributes).lower()
            if div:
                out["coverage"]["with_diversity"] += 1
                if div in _DIVERSITY_FEMALE:
                    female_joiners += 1

            src = (r.source_joiner_type or "").strip().lower()
            if src:
                out["coverage"]["with_source"] += 1
                if src == _RPO_SOURCE:
                    rpo_joiners += 1

        if created:
            out["coverage"]["with_creation_date"] += 1

    out["avg_ageing_days"] = _mean(ageing_vals)
    out["median_ageing_days"] = _median(ageing_vals)
    out["avg_tto_days"] = _mean(tto_vals)
    out["median_tto_days"] = _median(tto_vals)
    out["avg_ttf_days"] = _mean(ttf_vals)
    out["median_ttf_days"] = _median(ttf_vals)
    out["coverage"]["joiners"] = total_joiners
    if total_joiners > 0 and out["coverage"]["with_diversity"] > 0:
        out["diversity_pct"] = round(female_joiners / total_joiners * 100, 1)
    if total_joiners > 0 and out["coverage"]["with_source"] > 0:
        out["rpo_mix_pct"] = round(rpo_joiners / total_joiners * 100, 1)
    if offered_count > 0:
        out["offer_drop_pct"] = round(offer_drops / offered_count * 100, 1)

    out["cancelled"] = cancelled
    out["hold"] = hold
    out["total_demand"] = out["open"] + cancelled + hold
    if offered_count > 0:
        out["oar_pct"] = round(total_joiners / offered_count * 100, 1)
    if accepted_offers > 0:
        out["jcr_pct"] = round(total_joiners / accepted_offers * 100, 1)

    return out


def _compute_activity(
    records: list[Record],
    today: dt.date,
    start: dt.date,
    end: dt.date,
) -> dict[str, Any]:
    """Activity in [start, end]: offers, joiners, drops, period TTO/TTF/diversity."""
    out = _empty_bucket()
    tto_vals: list[int] = []
    ttf_vals: list[int] = []
    female_joiners = 0
    rpo_joiners = 0
    total_joiners = 0
    offered_in_period = 0
    offer_drops = 0
    opens_created = 0
    cancelled_in_period = 0
    hold_count = 0
    accepted_in_period = 0

    for r in records:
        created = _as_date(r.creation_date)
        offered_dt = _as_date(r.req_offered_date)
        offer_accept_dt = _as_date(r.offered_accept_date)
        join_dt = _as_date(r.joining_date)
        cancel_dt = _as_date(r.req_cancelled_date)

        if _is_hold(r):
            hold_count += 1

        if _in_range(created, start, end):
            opens_created += 1
            if _is_wip(r):
                out["wip"] += 1

        if cancel_dt and _in_range(cancel_dt, start, end):
            cancelled_in_period += 1
        elif _is_cancelled(r) and created and _in_range(created, start, end):
            cancelled_in_period += 1

        if _in_range(offered_dt, start, end):
            out["offered"] += 1
            offered_in_period += 1
            if created:
                d = _days_between(created, offered_dt)
                if d is not None and d >= 0:
                    tto_vals.append(d)

        if offer_accept_dt and _in_range(offer_accept_dt, start, end):
            accepted_in_period += 1
        elif (r.offers_accepted or 0) > 0 and offered_dt and _in_range(offered_dt, start, end):
            accepted_in_period += int(r.offers_accepted or 0)

        if join_dt and _in_range(join_dt, start, end) and _is_joiner(r, today):
            out["joiners"] += 1
            total_joiners += 1
            if created:
                d = _days_between(created, join_dt)
                if d is not None and d >= 0:
                    ttf_vals.append(d)

            div = _read_diversity(r.additional_attributes).lower()
            if div:
                out["coverage"]["with_diversity"] += 1
                if div in _DIVERSITY_FEMALE:
                    female_joiners += 1

            src = (r.source_joiner_type or "").strip().lower()
            if src:
                out["coverage"]["with_source"] += 1
                if src == _RPO_SOURCE:
                    rpo_joiners += 1

        if _is_offer_drop(r):
            drop_dt = _as_date(r.req_cancelled_date) or offered_dt or created
            if _in_range(drop_dt, start, end):
                offer_drops += 1
                out["offer_drops"] += 1

        # YTJ at period end
        if _is_ytj(r, end):
            out["ytj"] += 1

    out["open"] = opens_created
    out["avg_tto_days"] = _mean(tto_vals)
    out["median_tto_days"] = _median(tto_vals)
    out["avg_ttf_days"] = _mean(ttf_vals)
    out["median_ttf_days"] = _median(ttf_vals)
    out["coverage"]["joiners"] = total_joiners
    if total_joiners > 0 and out["coverage"]["with_diversity"] > 0:
        out["diversity_pct"] = round(female_joiners / total_joiners * 100, 1)
    if total_joiners > 0 and out["coverage"]["with_source"] > 0:
        out["rpo_mix_pct"] = round(rpo_joiners / total_joiners * 100, 1)
    if offered_in_period > 0:
        out["offer_drop_pct"] = round(offer_drops / offered_in_period * 100, 1)

    out["cancelled"] = cancelled_in_period
    out["hold"] = hold_count
    out["total_demand"] = opens_created + cancelled_in_period + hold_count
    if offered_in_period > 0:
        out["oar_pct"] = round(total_joiners / offered_in_period * 100, 1)
    if accepted_in_period > 0:
        out["jcr_pct"] = round(total_joiners / accepted_in_period * 100, 1)

    return out


def _fine_ageing_buckets(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    buckets = {"0-15": 0, "16-30": 0, "31-45": 0, "45+": 0}
    for r in records:
        if _norm_gs(r.global_status) == "CLOSED":
            continue
        created = _as_date(r.creation_date)
        if not created:
            continue
        days = (today - created).days
        if days < 0:
            continue
        if days <= 15:
            buckets["0-15"] += 1
        elif days <= 30:
            buckets["16-30"] += 1
        elif days <= 45:
            buckets["31-45"] += 1
        else:
            buckets["45+"] += 1
    return [{"bucket": k, "count": buckets[k]} for k in ("0-15", "16-30", "31-45", "45+")]


def _account_ageing_rows(
    records: list[Record],
    today: dt.date,
    project_labels: Optional[dict[int, str]] = None,
) -> list[dict[str, Any]]:
    labels = project_labels or {}
    groups: dict[str, dict[str, Any]] = {}

    for r in records:
        if _norm_gs(r.global_status) == "CLOSED":
            continue
        if not _is_wip(r) and not _is_open_req(r):
            continue
        created = _as_date(r.creation_date)
        if not created:
            continue
        days = (today - created).days
        if days < 0:
            continue

        account = (
            (r.rpo_bu_sbu or "").strip()
            or (r.rpo_client_name or "").strip()
            or labels.get(r.project_id or -1, "")
            or "Unknown"
        )
        row = groups.setdefault(
            account,
            {"account": account, "open": 0, "b_0_15": 0, "b_16_30": 0, "b_31_45": 0, "b_45_plus": 0, "oldest_days": 0},
        )
        row["open"] += 1
        row["oldest_days"] = max(row["oldest_days"], days)
        if days <= 15:
            row["b_0_15"] += 1
        elif days <= 30:
            row["b_16_30"] += 1
        elif days <= 45:
            row["b_31_45"] += 1
        else:
            row["b_45_plus"] += 1

    out: list[dict[str, Any]] = []
    for row in groups.values():
        pct_old = (row["b_45_plus"] / row["open"] * 100) if row["open"] else 0
        if row["oldest_days"] > 60 or pct_old >= 30:
            risk = "high"
        elif row["oldest_days"] > 45 or pct_old >= 15:
            risk = "medium"
        else:
            risk = "low"
        row["risk"] = risk
        out.append(row)
    out.sort(key=lambda x: (-x["oldest_days"], -x["open"]))
    return out


def _funnel_by_quarter(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    """Quarterly funnel averages from RPO profile counters on records."""
    anchor = dt.date(today.year, today.month, 1)
    quarters: list[dict[str, Any]] = []
    y, m = anchor.year, anchor.month
    for _ in range(4):
        start = dt.date(y, m, 1)
        end_m = m + 2
        ey, em = y, end_m
        if em > 12:
            em -= 12
            ey += 1
        last = calendar.monthrange(ey, em)[1]
        end = dt.date(ey, em, last)
        qn = (m - 1) // 3 + 1
        label = f"Q{qn} {y}"

        sourced = submitted = interviewed = offered = joined = 0
        n = 0
        for r in records:
            created = _as_date(r.creation_date)
            if not _in_range(created, start, end):
                continue
            n += 1
            sourced += int(r.profiles_sourced or 0)
            submitted += int(r.profiles_submitted or 0)
            interviewed += int(r.interviews_scheduled or 0)
            offered += int(r.offers_released or 0) or (1 if _is_offer_signal(r) else 0)
            if _is_joiner(r, today) and _as_date(r.joining_date) and _in_range(_as_date(r.joining_date), start, end):
                joined += 1

        quarters.append({
            "quarter": label,
            "sourced": sourced,
            "screened": submitted,
            "interviewed": interviewed,
            "offered": offered,
            "joined": joined,
            "req_count": n,
        })
        m -= 3
        if m <= 0:
            m += 12
            y -= 1
    quarters.reverse()
    return quarters


def _source_counts(records: list[Record], today: dt.date, mode: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in records:
        label = _hire_source_label(r)
        if mode == "joiners":
            if not _is_joiner(r, today):
                continue
        elif mode == "offers":
            if not _is_offer_signal(r):
                continue
        elif mode == "pipeline":
            if _norm_gs(r.global_status) == "CLOSED":
                continue
        counts[label] = counts.get(label, 0) + 1
    return counts


def _source_effectiveness(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    offers: dict[str, int] = {}
    joiners: dict[str, int] = {}
    for r in records:
        label = _hire_source_label(r)
        if _is_offer_signal(r):
            offers[label] = offers.get(label, 0) + 1
        if _is_joiner(r, today):
            joiners[label] = joiners.get(label, 0) + 1
    labels = sorted(set(offers) | set(joiners), key=lambda x: -joiners.get(x, 0))
    out: list[dict[str, Any]] = []
    for label in labels:
        o = offers.get(label, 0)
        j = joiners.get(label, 0)
        pct = round(j / o * 100, 1) if o > 0 else None
        out.append({"label": label, "offers": o, "joiners": j, "otj_pct": pct})
    return out


def _ageing_buckets(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    for r in records:
        if _norm_gs(r.global_status) == "CLOSED":
            continue
        created = _as_date(r.creation_date)
        if not created:
            continue
        days = (today - created).days
        if days < 0:
            continue
        if days <= 30:
            buckets["0-30"] += 1
        elif days <= 60:
            buckets["31-60"] += 1
        elif days <= 90:
            buckets["61-90"] += 1
        else:
            buckets["90+"] += 1
    return [{"bucket": k, "count": buckets[k]} for k in ("0-30", "31-60", "61-90", "90+")]


def _diversity_breakdown(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    counts: dict[str, int] = {"Female": 0, "Male": 0, "Other": 0, "Unknown": 0}
    for r in records:
        if not _is_joiner(r, today):
            continue
        div = _read_diversity(r.additional_attributes)
        if not div:
            counts["Unknown"] += 1
        elif div.lower() in _DIVERSITY_FEMALE:
            counts["Female"] += 1
        elif div.lower() == "male":
            counts["Male"] += 1
        else:
            counts["Other"] += 1
    return [{"label": k, "count": v} for k, v in counts.items() if v > 0 or k == "Unknown"]


def _source_breakdown(records: list[Record], today: dt.date) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for r in records:
        if not _is_joiner(r, today):
            continue
        src = (r.source_joiner_type or "").strip()
        label = src if src else "Unknown"
        if src == "taggd_rpo":
            label = "Taggd RPO"
        elif src == "taggd_direct":
            label = "Taggd Direct"
        elif src.startswith("nontaggd_"):
            label = src.replace("nontaggd_", "Non-Taggd ").replace("_", " ").title()
        counts[label] = counts.get(label, 0) + 1
    return [{"label": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]


def _monthly_series(records: list[Record], today: dt.date, months: int = 12) -> list[dict[str, Any]]:
    """Last N months of activity counts."""
    anchor = dt.date(today.year, today.month, 1)
    series: list[dict[str, Any]] = []
    y, m = anchor.year, anchor.month
    for _ in range(months):
        start = dt.date(y, m, 1)
        last = calendar.monthrange(y, m)[1]
        end = dt.date(y, m, last)
        key = f"{y:04d}-{m:02d}"
        opens = offers = joiners = drops = ytj_end = 0
        open_wip = cancelled = hold = aged_over_30 = 0
        tto_vals: list[int] = []
        ttf_vals: list[int] = []
        female_joiners = 0
        joiner_count = 0

        for r in records:
            created = _as_date(r.creation_date)
            offered_dt = _as_date(r.req_offered_date)
            join_dt = _as_date(r.joining_date)
            cancel_dt = _as_date(r.req_cancelled_date)

            if _in_range(created, start, end):
                opens += 1
            if cancel_dt and _in_range(cancel_dt, start, end):
                cancelled += 1
            if _is_hold(r) and _norm_gs(r.global_status) != "CLOSED":
                hold += 1
            if _is_open_req(r) or (_is_wip(r) and not _is_cancelled(r)):
                open_wip += 1
                if created:
                    days_open = (end - created).days
                    if days_open > 30:
                        aged_over_30 += 1

            if _in_range(offered_dt, start, end):
                offers += 1
                if created:
                    d = _days_between(created, offered_dt)
                    if d is not None and d >= 0:
                        tto_vals.append(d)

            if join_dt and _in_range(join_dt, start, end) and _is_joiner(r, today):
                joiners += 1
                joiner_count += 1
                if created:
                    d = _days_between(created, join_dt)
                    if d is not None and d >= 0:
                        ttf_vals.append(d)
                div = _read_diversity(r.additional_attributes).lower()
                if div in _DIVERSITY_FEMALE:
                    female_joiners += 1

            if _is_offer_drop(r):
                drop_dt = _as_date(r.req_cancelled_date) or offered_dt or created
                if _in_range(drop_dt, start, end):
                    drops += 1
            if _is_ytj(r, end):
                ytj_end += 1

        oar_pct = round(joiners / offers * 100, 1) if offers > 0 else None
        odr_pct = round(drops / offers * 100, 1) if offers > 0 else None
        div_pct = round(female_joiners / joiner_count * 100, 1) if joiner_count > 0 else None

        series.append({
            "month": key,
            "opens_created": opens,
            "open_wip": open_wip,
            "cancelled": cancelled,
            "hold": hold,
            "offered": offers,
            "joiners": joiners,
            "offer_drops": drops,
            "ytj_end": ytj_end,
            "avg_tto_days": _mean(tto_vals),
            "avg_ttf_days": _mean(ttf_vals),
            "female_hire_pct": div_pct,
            "aged_over_30": aged_over_30,
            "oar_pct": oar_pct,
            "odr_pct": odr_pct,
        })
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    series.reverse()
    return series


def _record_month_options(records: list[Record]) -> list[str]:
    months: set[str] = set()
    for r in records:
        for val in (r.creation_date, r.req_offered_date, r.joining_date, r.req_cancelled_date):
            d = _as_date(val)
            if d:
                months.add(f"{d.year:04d}-{d.month:02d}")
    return sorted(months, reverse=True)


def resolve_period(
    *,
    anchor: Optional[str],
    granularity: str,
    today: dt.date,
) -> tuple[dt.date, dt.date, str]:
    g = (granularity or "month").strip().lower()
    if g not in ("month", "quarter"):
        g = "month"
    a = (anchor or "").strip()
    if not a:
        a = f"{today.year:04d}-{today.month:02d}"
    if g == "quarter":
        if "-Q" not in a.upper():
            q = (today.month - 1) // 3 + 1
            a = f"{today.year:04d}-Q{q}"
        start, end = _quarter_bounds(a.upper())
        label = a.upper()
    else:
        if len(a) < 7:
            a = f"{today.year:04d}-{today.month:02d}"
        start, end = _month_bounds(a[:7])
        label = a[:7]
    return start, end, label


def _quarterly_from_monthly(monthly: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Roll monthly series rows into calendar quarters (sum counts, avg timings)."""
    buckets: dict[str, dict[str, Any]] = {}
    for row in monthly:
        y, m = int(row["month"][:4]), int(row["month"][5:7])
        q = (m - 1) // 3 + 1
        key = f"{y}-Q{q}"
        acc = buckets.setdefault(
            key,
            {
                "quarter": key,
                "opens_created": 0,
                "open_wip": 0,
                "cancelled": 0,
                "hold": 0,
                "offered": 0,
                "joiners": 0,
                "offer_drops": 0,
                "aged_over_30": 0,
                "_tto": [],
                "_ttf": [],
                "_div": [],
            },
        )
        for fk in ("opens_created", "open_wip", "cancelled", "hold", "offered", "joiners", "offer_drops", "aged_over_30"):
            acc[fk] += int(row.get(fk) or 0)
        if row.get("avg_tto_days") is not None:
            acc["_tto"].append(float(row["avg_tto_days"]))
        if row.get("avg_ttf_days") is not None:
            acc["_ttf"].append(float(row["avg_ttf_days"]))
        if row.get("female_hire_pct") is not None:
            acc["_div"].append(float(row["female_hire_pct"]))

    out: list[dict[str, Any]] = []
    for key in sorted(buckets.keys()):
        acc = buckets[key]
        offers = int(acc["offered"])
        joiners = int(acc["joiners"])
        drops = int(acc["offer_drops"])
        row = {k: acc[k] for k in ("quarter", "opens_created", "open_wip", "cancelled", "hold", "offered", "joiners", "offer_drops", "aged_over_30")}
        row["avg_tto_days"] = round(sum(acc["_tto"]) / len(acc["_tto"]), 1) if acc["_tto"] else None
        row["avg_ttf_days"] = round(sum(acc["_ttf"]) / len(acc["_ttf"]), 1) if acc["_ttf"] else None
        row["female_hire_pct"] = round(sum(acc["_div"]) / len(acc["_div"]), 1) if acc["_div"] else None
        row["oar_pct"] = round(joiners / offers * 100, 1) if offers > 0 else None
        row["odr_pct"] = round(drops / offers * 100, 1) if offers > 0 else None
        out.append(row)
    return out


def _source_monthly_series(records: list[Record], today: dt.date, months: int = 12) -> list[dict[str, Any]]:
    anchor = dt.date(today.year, today.month, 1)
    series: list[dict[str, Any]] = []
    y, m = anchor.year, anchor.month
    for _ in range(months):
        start = dt.date(y, m, 1)
        last = calendar.monthrange(y, m)[1]
        end = dt.date(y, m, last)
        key = f"{y:04d}-{m:02d}"
        joiner_counts: dict[str, int] = {}
        offer_counts: dict[str, int] = {}
        for r in records:
            label = _hire_source_label(r)
            offered_dt = _as_date(r.req_offered_date)
            join_dt = _as_date(r.joining_date)
            if offered_dt and _in_range(offered_dt, start, end) and _is_offer_signal(r):
                offer_counts[label] = offer_counts.get(label, 0) + 1
            if join_dt and _in_range(join_dt, start, end) and _is_joiner(r, today):
                joiner_counts[label] = joiner_counts.get(label, 0) + 1
        series.append({"month": key, "joiners": joiner_counts, "offers": offer_counts})
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    series.reverse()
    return series


def compute_pipeline_metrics(
    records: list[Record],
    *,
    today: Optional[dt.date] = None,
    period_anchor: Optional[str] = None,
    granularity: str = "month",
    compare: str = "mom",
    project_labels: Optional[dict[int, str]] = None,
) -> dict[str, Any]:
    """Full pipeline payload for client dashboard."""
    today = today or dt.date.today()
    period_start, period_end, period_label = resolve_period(
        anchor=period_anchor, granularity=granularity, today=today,
    )
    prior_start, prior_end = _prior_period(period_start, period_end, granularity)

    snapshot = _compute_snapshot(records, today)
    period = _compute_activity(records, today, period_start, period_end)
    prior = _compute_activity(records, today, prior_start, prior_end)

    cmp = (compare or "mom").strip().lower()
    deltas: dict[str, Optional[float]] = {}
    if cmp in ("mom", "qoq"):
        for key in ("wip", "open", "offered", "ytj", "joiners", "offer_drops", "cancelled", "hold", "total_demand"):
            cur = float(period.get(key) or 0)
            prev = float(prior.get(key) or 0)
            deltas[f"{key}_pct"] = _pct_delta(cur, prev if prev else None)
        for key in (
            "diversity_pct", "rpo_mix_pct", "offer_drop_pct", "avg_tto_days", "avg_ttf_days",
            "oar_pct", "jcr_pct",
        ):
            deltas[f"{key}_delta"] = None
            cur = period.get(key)
            prev = prior.get(key)
            if cur is not None and prev is not None:
                deltas[f"{key}_delta"] = round(float(cur) - float(prev), 1)
        deltas["median_ageing_days_delta"] = None

    monthly = _monthly_series(records, today)
    src_joiners = _source_counts(records, today, "joiners")
    src_offers = _source_counts(records, today, "offers")
    src_pipeline = _source_counts(records, today, "pipeline")

    return {
        "snapshot": snapshot,
        "period": period,
        "prior_period": prior,
        "deltas": deltas,
        "period_label": period_label,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "prior_period_start": prior_start.isoformat(),
        "prior_period_end": prior_end.isoformat(),
        "granularity": granularity,
        "compare": cmp,
        "ageing_buckets": _ageing_buckets(records, today),
        "fine_ageing_buckets": _fine_ageing_buckets(records, today),
        "account_ageing_rows": _account_ageing_rows(records, today, project_labels),
        "diversity_breakdown": _diversity_breakdown(records, today),
        "source_breakdown": _source_breakdown(records, today),
        "source_breakdown_offers": [{"label": k, "count": v} for k, v in sorted(src_offers.items(), key=lambda x: -x[1])],
        "source_breakdown_pipeline": [{"label": k, "count": v} for k, v in sorted(src_pipeline.items(), key=lambda x: -x[1])],
        "source_effectiveness": _source_effectiveness(records, today),
        "source_monthly": _source_monthly_series(records, today),
        "funnel_by_quarter": _funnel_by_quarter(records, today),
        "series": monthly,
        "quarterly_series": _quarterly_from_monthly(monthly),
        "period_month_options": _record_month_options(records),
        "updated_at": today.isoformat(),
    }


def _merge_buckets(chunks: list[dict[str, Any]], key: str) -> dict[str, Any]:
    merged = _empty_bucket()
    ageing_buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    div_counts: dict[str, int] = {}
    src_counts: dict[str, int] = {}
    tto_vals: list[float] = []
    ttf_vals: list[float] = []
    ageing_vals: list[float] = []

    for ch in chunks:
        bucket = ch.get(key) or {}
        for k in ("wip", "open", "offered", "ytj", "joiners", "offer_drops", "cancelled", "hold", "total_demand"):
            merged[k] = int(merged.get(k, 0)) + int(bucket.get(k) or 0)
        cov = bucket.get("coverage") or {}
        mc = merged["coverage"]
        for ck in ("joiners", "with_diversity", "with_source", "with_offer_date", "with_creation_date"):
            mc[ck] = int(mc.get(ck, 0)) + int(cov.get(ck) or 0)
        for metric, dest in (
            ("avg_tto_days", tto_vals),
            ("avg_ttf_days", ttf_vals),
            ("median_ageing_days", ageing_vals),
            ("avg_ageing_days", ageing_vals),
        ):
            v = bucket.get(metric)
            if v is not None:
                dest.append(float(v))

    j = merged["coverage"]["joiners"]
    if key == "snapshot":
        for ch in chunks:
            for b in ch.get("ageing_buckets") or []:
                ageing_buckets[b["bucket"]] = ageing_buckets.get(b["bucket"], 0) + int(b.get("count") or 0)
            for d in ch.get("diversity_breakdown") or []:
                div_counts[d["label"]] = div_counts.get(d["label"], 0) + int(d.get("count") or 0)
            for s in ch.get("source_breakdown") or []:
                src_counts[s["label"]] = src_counts.get(s["label"], 0) + int(s.get("count") or 0)

    if ageing_vals:
        merged["median_ageing_days"] = round(float(statistics.median(ageing_vals)), 1)
        merged["avg_ageing_days"] = round(float(statistics.mean(ageing_vals)), 1)
    if tto_vals:
        merged["avg_tto_days"] = round(float(statistics.mean(tto_vals)), 1)
        merged["median_tto_days"] = round(float(statistics.median(tto_vals)), 1)
    if ttf_vals:
        merged["avg_ttf_days"] = round(float(statistics.mean(ttf_vals)), 1)
        merged["median_ttf_days"] = round(float(statistics.median(ttf_vals)), 1)

    if j > 0 and merged["coverage"]["with_diversity"] > 0 and div_counts:
        female = div_counts.get("Female", 0)
        merged["diversity_pct"] = round(female / j * 100, 1)
    if j > 0 and merged["coverage"]["with_source"] > 0 and src_counts:
        rpo = src_counts.get("Taggd RPO", 0)
        merged["rpo_mix_pct"] = round(rpo / j * 100, 1)
    offered = int(merged.get("offered") or 0)
    drops = int(merged.get("offer_drops") or 0)
    if offered > 0:
        merged["offer_drop_pct"] = round(drops / offered * 100, 1)
        merged["oar_pct"] = round(int(merged.get("joiners") or 0) / offered * 100, 1)

    return merged, ageing_buckets, div_counts, src_counts


def merge_pipeline_for_projects(
    by_project: dict[str, dict[str, Any]],
    project_ids: list[int],
) -> dict[str, Any]:
    """Merge per-project pipeline payloads for BU tab filtering."""
    ids = [str(pid) for pid in project_ids]
    chunks = [by_project[pid] for pid in ids if pid in by_project]
    if not chunks:
        return compute_pipeline_metrics([], granularity="month")

    snap, ageing_buckets, div_counts, src_counts = _merge_buckets(chunks, "snapshot")
    period, _, _, _ = _merge_buckets(chunks, "period")
    prior, _, _, _ = _merge_buckets(chunks, "prior_period")

    deltas: dict[str, Optional[float]] = {}
    for key in ("wip", "open", "offered", "ytj", "joiners", "offer_drops", "cancelled", "hold", "total_demand"):
        cur = float(period.get(key) or 0)
        prev = float(prior.get(key) or 0)
        deltas[f"{key}_pct"] = _pct_delta(cur, prev if prev else None)
    for key in ("diversity_pct", "rpo_mix_pct", "offer_drop_pct", "avg_tto_days", "avg_ttf_days", "oar_pct", "jcr_pct"):
        cur = period.get(key)
        prev = prior.get(key)
        if cur is not None and prev is not None:
            deltas[f"{key}_delta"] = round(float(cur) - float(prev), 1)

    series_by_month: dict[str, dict[str, Any]] = {}
    fine_ageing: dict[str, int] = {"0-15": 0, "16-30": 0, "31-45": 0, "45+": 0}
    account_rows: dict[str, dict[str, Any]] = {}
    src_offers: dict[str, int] = {}
    src_pipeline: dict[str, int] = {}
    funnel_map: dict[str, dict[str, int]] = {}
    month_opts: set[str] = set()

    for ch in chunks:
        for row in ch.get("series") or []:
            m = row["month"]
            if m not in series_by_month:
                series_by_month[m] = {
                    "month": m,
                    "opens_created": 0, "open_wip": 0, "cancelled": 0, "hold": 0,
                    "offered": 0, "joiners": 0, "offer_drops": 0, "ytj_end": 0, "aged_over_30": 0,
                    "_tto": [], "_ttf": [], "_div": [],
                }
            acc = series_by_month[m]
            for fk in ("opens_created", "open_wip", "cancelled", "hold", "offered", "joiners", "offer_drops", "ytj_end", "aged_over_30"):
                acc[fk] += int(row.get(fk) or 0)
            if row.get("avg_tto_days") is not None:
                acc["_tto"].append(float(row["avg_tto_days"]))
            if row.get("avg_ttf_days") is not None:
                acc["_ttf"].append(float(row["avg_ttf_days"]))
            if row.get("female_hire_pct") is not None:
                acc["_div"].append(float(row["female_hire_pct"]))
        for b in ch.get("fine_ageing_buckets") or []:
            fine_ageing[b["bucket"]] = fine_ageing.get(b["bucket"], 0) + int(b.get("count") or 0)
        for ar in ch.get("account_ageing_rows") or []:
            k = ar["account"]
            if k not in account_rows:
                account_rows[k] = dict(ar)
            else:
                ex = account_rows[k]
                for fk in ("open", "b_0_15", "b_16_30", "b_31_45", "b_45_plus"):
                    ex[fk] = int(ex.get(fk) or 0) + int(ar.get(fk) or 0)
                ex["oldest_days"] = max(int(ex.get("oldest_days") or 0), int(ar.get("oldest_days") or 0))
        for s in ch.get("source_breakdown_offers") or []:
            src_offers[s["label"]] = src_offers.get(s["label"], 0) + int(s.get("count") or 0)
        for s in ch.get("source_breakdown_pipeline") or []:
            src_pipeline[s["label"]] = src_pipeline.get(s["label"], 0) + int(s.get("count") or 0)
        for fq in ch.get("funnel_by_quarter") or []:
            qk = fq["quarter"]
            acc = funnel_map.setdefault(qk, {"quarter": qk, "sourced": 0, "screened": 0, "interviewed": 0, "offered": 0, "joined": 0, "req_count": 0})
            for fk in ("sourced", "screened", "interviewed", "offered", "joined", "req_count"):
                acc[fk] += int(fq.get(fk) or 0)
        for mo in ch.get("period_month_options") or []:
            month_opts.add(mo)

    series_out: list[dict[str, Any]] = []
    for m in sorted(series_by_month.keys()):
        acc = series_by_month[m]
        offers = int(acc["offered"])
        joiners = int(acc["joiners"])
        drops = int(acc["offer_drops"])
        series_out.append({
            "month": m,
            "opens_created": acc["opens_created"],
            "open_wip": acc["open_wip"],
            "cancelled": acc["cancelled"],
            "hold": acc["hold"],
            "offered": offers,
            "joiners": joiners,
            "offer_drops": drops,
            "ytj_end": acc["ytj_end"],
            "aged_over_30": acc["aged_over_30"],
            "avg_tto_days": round(sum(acc["_tto"]) / len(acc["_tto"]), 1) if acc["_tto"] else None,
            "avg_ttf_days": round(sum(acc["_ttf"]) / len(acc["_ttf"]), 1) if acc["_ttf"] else None,
            "female_hire_pct": round(sum(acc["_div"]) / len(acc["_div"]), 1) if acc["_div"] else None,
            "oar_pct": round(joiners / offers * 100, 1) if offers > 0 else None,
            "odr_pct": round(drops / offers * 100, 1) if offers > 0 else None,
        })

    meta = chunks[0]
    return {
        "snapshot": snap,
        "period": period,
        "prior_period": prior,
        "deltas": deltas,
        "period_label": meta.get("period_label"),
        "period_start": meta.get("period_start"),
        "period_end": meta.get("period_end"),
        "prior_period_start": meta.get("prior_period_start"),
        "prior_period_end": meta.get("prior_period_end"),
        "granularity": meta.get("granularity"),
        "compare": meta.get("compare"),
        "ageing_buckets": [{"bucket": k, "count": ageing_buckets[k]} for k in ("0-30", "31-60", "61-90", "90+")],
        "fine_ageing_buckets": [{"bucket": k, "count": fine_ageing[k]} for k in ("0-15", "16-30", "31-45", "45+")],
        "account_ageing_rows": sorted(account_rows.values(), key=lambda x: (-x.get("oldest_days", 0), -x.get("open", 0))),
        "diversity_breakdown": [{"label": k, "count": v} for k, v in div_counts.items()],
        "source_breakdown": [{"label": k, "count": v} for k, v in sorted(src_counts.items(), key=lambda x: -x[1])],
        "source_breakdown_offers": [{"label": k, "count": v} for k, v in sorted(src_offers.items(), key=lambda x: -x[1])],
        "source_breakdown_pipeline": [{"label": k, "count": v} for k, v in sorted(src_pipeline.items(), key=lambda x: -x[1])],
        "source_effectiveness": [],
        "source_monthly": [],
        "funnel_by_quarter": [funnel_map[k] for k in sorted(funnel_map.keys())],
        "series": series_out,
        "quarterly_series": _quarterly_from_monthly(series_out),
        "period_month_options": sorted(month_opts, reverse=True),
        "updated_at": meta.get("updated_at"),
    }
