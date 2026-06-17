"""Indian business-day calendar for client-dashboard time metrics.

Counts Monday–Friday excluding India national gazetted public holidays
(Republic Day, Independence Day, Gandhi Jayanti, Christmas, and major
movable festivals via the ``holidays`` package).
"""
from __future__ import annotations

import datetime as dt
from functools import lru_cache
from typing import Optional

import holidays


@lru_cache(maxsize=8)
def _india_holidays(start_year: int, end_year: int) -> holidays.HolidayBase:
    return holidays.India(years=range(start_year, end_year + 1))


def _holiday_set_for(start: dt.date, end: dt.date) -> set[dt.date]:
    ys = min(start.year, end.year)
    ye = max(start.year, end.year)
    cal = _india_holidays(ys, ye)
    return {d for d in cal if start <= d <= end}


def is_business_day(d: dt.date) -> bool:
    """True when *d* is a weekday and not an India national public holiday."""
    if d.weekday() >= 5:  # Saturday / Sunday
        return False
    cal = _india_holidays(d.year, d.year)
    return d not in cal


def business_days_between(
    start: Optional[dt.date],
    end: Optional[dt.date],
) -> Optional[int]:
    """Business days in [start, end), matching calendar ``(end - start).days`` semantics."""
    if start is None or end is None:
        return None
    if end < start:
        return None
    if start == end:
        return 0

    holiday_dates = _holiday_set_for(start, end)
    count = 0
    d = start
    one = dt.timedelta(days=1)
    while d < end:
        if d.weekday() < 5 and d not in holiday_dates:
            count += 1
        d += one
    return count
