"""Client portal requisition pipeline metrics — snapshot + activity period aggregates."""
from __future__ import annotations

import calendar
import datetime as dt
import statistics
from typing import Any, Optional

from backend.db.database import Record

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

    for r in records:
        gs = _norm_gs(r.global_status)
        created = _as_date(r.creation_date)

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

    for r in records:
        created = _as_date(r.creation_date)
        offered_dt = _as_date(r.req_offered_date)
        join_dt = _as_date(r.joining_date)

        if _in_range(created, start, end):
            opens_created += 1
            if _is_wip(r):
                out["wip"] += 1

        if _in_range(offered_dt, start, end):
            out["offered"] += 1
            offered_in_period += 1
            if created:
                d = _days_between(created, offered_dt)
                if d is not None and d >= 0:
                    tto_vals.append(d)

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
        for r in records:
            created = _as_date(r.creation_date)
            offered_dt = _as_date(r.req_offered_date)
            join_dt = _as_date(r.joining_date)
            if _in_range(created, start, end):
                opens += 1
            if _in_range(offered_dt, start, end):
                offers += 1
            if join_dt and _in_range(join_dt, start, end) and _is_joiner(r, today):
                joiners += 1
            if _is_offer_drop(r):
                drop_dt = _as_date(r.req_cancelled_date) or offered_dt or created
                if _in_range(drop_dt, start, end):
                    drops += 1
            if _is_ytj(r, end):
                ytj_end += 1
        series.append({
            "month": key,
            "opens_created": opens,
            "offered": offers,
            "joiners": joiners,
            "offer_drops": drops,
            "ytj_end": ytj_end,
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


def compute_pipeline_metrics(
    records: list[Record],
    *,
    today: Optional[dt.date] = None,
    period_anchor: Optional[str] = None,
    granularity: str = "month",
    compare: str = "mom",
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
        for key in ("wip", "open", "offered", "ytj", "joiners", "offer_drops"):
            cur = float(period.get(key) or 0)
            prev = float(prior.get(key) or 0)
            deltas[f"{key}_pct"] = _pct_delta(cur, prev if prev else None)
        for key in ("diversity_pct", "rpo_mix_pct", "offer_drop_pct", "avg_tto_days", "avg_ttf_days", "median_ageing_days"):
            deltas[f"{key}_delta"] = None
            cur = period.get(key)
            prev = prior.get(key)
            if cur is not None and prev is not None:
                deltas[f"{key}_delta"] = round(float(cur) - float(prev), 1)

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
        "diversity_breakdown": _diversity_breakdown(records, today),
        "source_breakdown": _source_breakdown(records, today),
        "series": _monthly_series(records, today),
        "period_month_options": _record_month_options(records),
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
        for k in ("wip", "open", "offered", "ytj", "joiners", "offer_drops"):
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
    for key in ("wip", "open", "offered", "ytj", "joiners", "offer_drops"):
        cur = float(period.get(key) or 0)
        prev = float(prior.get(key) or 0)
        deltas[f"{key}_pct"] = _pct_delta(cur, prev if prev else None)
    for key in ("diversity_pct", "rpo_mix_pct", "offer_drop_pct", "avg_tto_days", "avg_ttf_days"):
        cur = period.get(key)
        prev = prior.get(key)
        if cur is not None and prev is not None:
            deltas[f"{key}_delta"] = round(float(cur) - float(prev), 1)

    series_by_month: dict[str, dict[str, int]] = {}
    month_opts: set[str] = set()
    for ch in chunks:
        for row in ch.get("series") or []:
            m = row["month"]
            if m not in series_by_month:
                series_by_month[m] = {"opens_created": 0, "offered": 0, "joiners": 0, "offer_drops": 0, "ytj_end": 0}
            for fk in series_by_month[m]:
                series_by_month[m][fk] += int(row.get(fk) or 0)
        for mo in ch.get("period_month_options") or []:
            month_opts.add(mo)

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
        "diversity_breakdown": [{"label": k, "count": v} for k, v in div_counts.items()],
        "source_breakdown": [{"label": k, "count": v} for k, v in sorted(src_counts.items(), key=lambda x: -x[1])],
        "series": [{"month": m, **series_by_month[m]} for m in sorted(series_by_month.keys())],
        "period_month_options": sorted(month_opts, reverse=True),
    }
