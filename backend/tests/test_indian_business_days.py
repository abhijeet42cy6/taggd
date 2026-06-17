"""Tests for Indian business-day calendar used in client pipeline metrics."""
from __future__ import annotations

import datetime as dt

from backend.core.indian_business_days import business_days_between, is_business_day


def test_weekend_is_not_business_day():
    assert not is_business_day(dt.date(2026, 6, 13))  # Saturday
    assert not is_business_day(dt.date(2026, 6, 14))  # Sunday
    assert is_business_day(dt.date(2026, 6, 15))  # Monday


def test_republic_day_is_holiday():
    assert not is_business_day(dt.date(2026, 1, 26))


def test_business_days_exclude_weekends():
    start = dt.date(2026, 6, 8)   # Monday
    end = dt.date(2026, 6, 15)      # Monday (exclusive end)
    assert business_days_between(start, end) == 5  # Mon–Fri


def test_business_days_match_calendar_when_no_holidays_in_span():
    start = dt.date(2026, 3, 2)   # Monday
    end = dt.date(2026, 3, 9)     # Monday
    assert business_days_between(start, end) == 5
    assert (end - start).days == 7


def test_same_day_is_zero():
    d = dt.date(2026, 6, 10)
    assert business_days_between(d, d) == 0


def test_end_before_start_returns_none():
    assert business_days_between(dt.date(2026, 6, 10), dt.date(2026, 6, 1)) is None
