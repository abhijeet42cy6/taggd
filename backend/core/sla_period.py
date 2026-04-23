"""
Parse SLA Base File month columns into calendar periods for month-on-month analysis.

Column names typically look like: 'Apr24 Score', 'Apr MET/NOT_MET' (paired with Score).
This module maps free-text labels to the first day of a calendar month (or quarter).
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Optional

# Quarter labels → (year, start_month) for first day of quarter
_QUARTER_FIRST_MONTH: dict[str, tuple[int, int]] = {
    "JAS24": (2024, 7),
    "JAS25": (2025, 7),
    "OND 24": (2024, 10),
    "OND24": (2024, 10),
    "JFM'25": (2025, 1),
    "JFM25": (2025, 1),
    "AMJ25": (2025, 4),
    "AMJ26": (2026, 4),
}

# Single-month overrides where abbreviation + year doesn't follow the usual pattern
_MONTH_OVERRIDES: dict[str, tuple[int, int]] = {
    "Aug25": (2025, 8),
    "Aug24": (2024, 8),
    "Oct25": (2025, 10),
    "Sep25": (2025, 9),
    "Sep24": (2024, 9),
}

_MONTH_NUM: dict[str, int] = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

_GARBAGE = frozenset(
    {
        "YTD",
        "Metrics to be picked of BE  (Measure Name as per standard Metrics)",
    }
)


def canonical_month_label(d: dt.date | dt.datetime | str | None) -> str:
    """Stable month id for APIs and DB reporting_month (lexicographically sortable)."""
    if d is None:
        return ""
    if isinstance(d, str):
        s = d.strip()
        if len(s) >= 7 and s[4] == "-" and s[:4].isdigit():
            return s[:7]
        try:
            parsed = dt.datetime.fromisoformat(s[:10]).date()
            return f"{parsed.year:04d}-{parsed.month:02d}"
        except ValueError:
            return s
    if isinstance(d, dt.datetime):
        d = d.date()
    return f"{d.year:04d}-{d.month:02d}"


def parse_sla_month_label(raw: str) -> Optional[dt.date]:
    """
    Map a month key (from a Score column or stored reporting_month) to period start (1st of month).
    Returns None if the label cannot be parsed.
    """
    m = (raw or "").strip()
    if not m or m in _GARBAGE or "Metrics to be picked" in m:
        return None

    if m in _MONTH_OVERRIDES:
        y, mo = _MONTH_OVERRIDES[m]
        return dt.date(y, mo, 1)

    if m in _QUARTER_FIRST_MONTH:
        y, mo = _QUARTER_FIRST_MONTH[m]
        return dt.date(y, mo, 1)

    # "Apr24", "Apr 24", "April24" — longest month prefix wins (e.g. April before Apr ambiguity)
    m_compact = re.sub(r"\s+", "", m)
    low = m_compact.lower()
    for key, num in sorted(_MONTH_NUM.items(), key=lambda kv: -len(kv[0])):
        kl = key.lower()
        if low.startswith(kl):
            suffix = m_compact[len(key) :]
            suffix = re.sub(r"[^\d]", "", suffix)
            try:
                if len(suffix) >= 4:
                    year = int(suffix[:4])
                elif len(suffix) >= 2:
                    yy = int(suffix[:2])
                    year = 2000 + yy if yy < 100 else yy
                else:
                    return None
                return dt.date(year, num, 1)
            except ValueError:
                pass
            return None

    return None


def parse_sla_score_column_name(col_name: str) -> Optional[dt.date]:
    """
    Derive period from Excel column header, e.g. 'Apr24 Score' -> 2024-04-01.
    """
    label = str(col_name).replace("Score", "").strip()
    return parse_sla_month_label(label)


def sort_key_for_month_label(m: str) -> float:
    """Sort key for canonical YYYY-MM or legacy labels."""
    m = (m or "").strip()
    if len(m) == 7 and m[4] == "-" and m[:4].isdigit():
        try:
            y, mo = int(m[:4]), int(m[5:7])
            return float(y) + mo / 100.0
        except ValueError:
            pass
    return month_sort_key(m)


def month_sort_key(m: str) -> float:
    """
    Sort key for legacy string labels (same behaviour as previous main.py helper).
    Prefer ordering by period_start in SQL/API when available.
    """
    d = parse_sla_month_label(m)
    if d:
        return float(d.year) + d.month / 100.0

    if m in _QUARTER_FIRST_MONTH:
        y, mo = _QUARTER_FIRST_MONTH[m]
        return float(y) + mo / 100.0

    if m in _MONTH_OVERRIDES:
        y, mo = _MONTH_OVERRIDES[m]
        return float(y) + mo / 100.0

    return 9999.0


def bucket_sla_rag(rag: str | None) -> str:
    """
    Map rag_status to API timeline buckets: 'met' | 'not_met' | 'not_reported'.
    Aligned with upload template enums (Green/Amber/Red/Grey, RAG_*) and Base File (Met/Not Met).
    """
    s = (rag or "").strip().lower()
    if not s or s in ("nan", "none", "-", "n/a", "not reported", "no data", "grey", "gray"):
        return "not_reported"
    if s in ("met", "green", "rag_g"):
        return "met"
    if "not met" in s or s in (
        "red",
        "amber",
        "yellow",
        "rag_r",
        "rag_a",
        "breach",
        "breached",
        "not_met",
        "not met",
    ):
        return "not_met"
    return "not_reported"
