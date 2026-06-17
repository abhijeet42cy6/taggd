"""Tests for pipeline period range resolution."""
from __future__ import annotations

import datetime as dt

from backend.core.client_pipeline_metrics import (
    _prior_period_for_range,
    resolve_period_range,
)


def test_resolve_period_range_single_month():
    today = dt.date(2026, 6, 15)
    start, end, label = resolve_period_range(period_from="2026-04", period_to="2026-04", today=today)
    assert start == dt.date(2026, 4, 1)
    assert end == dt.date(2026, 4, 30)
    assert label == "2026-04"


def test_resolve_period_range_multi_month():
    today = dt.date(2026, 6, 15)
    start, end, label = resolve_period_range(period_from="2026-04", period_to="2026-06", today=today)
    assert start == dt.date(2026, 4, 1)
    assert end == dt.date(2026, 6, 30)
    assert label == "2026-04 – 2026-06"


def test_resolve_period_range_swaps_inverted_inputs():
    today = dt.date(2026, 6, 15)
    start, end, label = resolve_period_range(period_from="2026-06", period_to="2026-04", today=today)
    assert start == dt.date(2026, 4, 1)
    assert end == dt.date(2026, 6, 30)
    assert label == "2026-04 – 2026-06"


def test_prior_period_for_range_three_months():
    start = dt.date(2026, 4, 1)
    end = dt.date(2026, 6, 30)
    prior_start, prior_end = _prior_period_for_range(start, end)
    assert prior_start == dt.date(2026, 1, 1)
    assert prior_end == dt.date(2026, 3, 31)
