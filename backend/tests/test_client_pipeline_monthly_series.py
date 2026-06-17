"""Tests for client pipeline monthly requisition flow series."""
from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

from backend.core.client_pipeline_metrics import _monthly_series


def _rec(**kwargs):
    defaults = {
        "offered_accept_date": None,
        "offers_accepted": 0,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_monthly_open_wip_varies_by_month_not_flat_snapshot():
    """open_wip should be point-in-time per month, not the same total every month."""
    today = dt.date(2026, 6, 15)
    records = [
        _rec(
            creation_date=dt.date(2026, 1, 10),
            joining_date=None,
            req_cancelled_date=None,
            global_status="ACTIVE",
            status="Open",
            req_offered_date=None,
            offered_ctc=None,
            candidate_name="A",
            profiles_sourced=0,
            profiles_submitted=0,
            interviews_scheduled=0,
            offers_released=0,
            additional_attributes={},
            source_joiner_type=None,
        ),
        _rec(
            creation_date=dt.date(2026, 5, 1),
            joining_date=None,
            req_cancelled_date=None,
            global_status="ACTIVE",
            status="Open",
            req_offered_date=None,
            offered_ctc=None,
            candidate_name="B",
            profiles_sourced=0,
            profiles_submitted=0,
            interviews_scheduled=0,
            offers_released=0,
            additional_attributes={},
            source_joiner_type=None,
        ),
        _rec(
            creation_date=dt.date(2026, 3, 1),
            joining_date=dt.date(2026, 4, 15),
            req_cancelled_date=None,
            global_status="CLOSED",
            status="Joined",
            req_offered_date=dt.date(2026, 4, 1),
            offered_ctc=10.0,
            candidate_name="C",
            profiles_sourced=0,
            profiles_submitted=0,
            interviews_scheduled=0,
            offers_released=0,
            additional_attributes={},
            source_joiner_type=None,
        ),
    ]
    series = _monthly_series(records, today, months=6)
    by_month = {row["month"]: row for row in series}
    # Jan–Apr: only first req exists (third is CLOSED, not counted as open)
    assert by_month["2026-01"]["open_wip"] == 1
    assert by_month["2026-04"]["open_wip"] == 1
    # May–Jun: first + second (third joined in Apr)
    assert by_month["2026-05"]["open_wip"] == 2
    assert by_month["2026-06"]["open_wip"] == 2
    assert len({row["open_wip"] for row in series}) > 1


def test_open_wip_excludes_offered_pipeline():
    """open_wip stock should count open mandates only, not offered pipeline rows."""
    today = dt.date(2026, 6, 15)
    end = dt.date(2026, 6, 30)
    open_rec = _rec(
        creation_date=dt.date(2026, 1, 10),
        joining_date=None,
        req_cancelled_date=None,
        global_status="ACTIVE",
        status="Open",
        req_offered_date=None,
        offered_ctc=None,
        candidate_name="A",
        profiles_sourced=0,
        profiles_submitted=0,
        interviews_scheduled=0,
        offers_released=0,
        additional_attributes={},
        source_joiner_type=None,
    )
    offered_rec = _rec(
        creation_date=dt.date(2026, 2, 1),
        joining_date=None,
        req_cancelled_date=None,
        global_status="PIPELINE",
        status="Offered",
        req_offered_date=dt.date(2026, 3, 1),
        offered_ctc=10.0,
        candidate_name="B",
        profiles_sourced=0,
        profiles_submitted=0,
        interviews_scheduled=0,
        offers_released=0,
        additional_attributes={},
        source_joiner_type=None,
    )
    from backend.core.client_pipeline_metrics import _req_open_at

    assert _req_open_at(open_rec, end) is True
    assert _req_open_at(offered_rec, end) is False
    series = _monthly_series([open_rec, offered_rec], today, months=3)
    jun = [r for r in series if r["month"] == "2026-06"][0]
    assert jun["open_wip"] == 1


def test_monthly_cancelled_counts_flow_in_month_only():
    today = dt.date(2026, 6, 15)
    records = [
        _rec(
            creation_date=dt.date(2026, 2, 1),
            joining_date=None,
            req_cancelled_date=dt.date(2026, 4, 20),
            global_status="CANCELLED",
            status="Cancelled",
            req_offered_date=None,
            offered_ctc=None,
            candidate_name="X",
            profiles_sourced=0,
            profiles_submitted=0,
            interviews_scheduled=0,
            offers_released=0,
            additional_attributes={},
            source_joiner_type=None,
        ),
    ]
    series = _monthly_series(records, today, months=6)
    by_month = {row["month"]: row for row in series}
    assert by_month["2026-04"]["cancelled"] == 1
    assert by_month["2026-03"]["cancelled"] == 0
