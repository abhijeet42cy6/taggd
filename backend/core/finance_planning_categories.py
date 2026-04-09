"""
Finer `finance_monthly_ledger.metric_category` values for budget/forecast template lines.

Keeps unique key (project_id, reporting_month, metric_category). Corporate finance ingest
continues to use Revenue, Contribution Margin, Cost.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Final

# Template-derived forecast lines (cleared on re-upload for affected projects).
# Revenue rows are not deleted: quarterly budget overwrites `Revenue.budget_value` per month only.
PLANNING_FORECAST_CATEGORIES: Final[frozenset[str]] = frozenset(
    {
        "Revenue_MMF",
        "Revenue_JoiningFee",
        "Revenue_OpeningFee",
        "Revenue_ToBeOfferFee",
        "Forecast_Joiners",
        "Revenue_PlanningOther",
    }
)

# MMF waterfall / bridge reads `Revenue_MMF.forecast_value` (see budget_forecast_ledger.waterfall_from_ledger).
WATERFALL_MMF_CATEGORY: Final[str] = "Revenue_MMF"

DEFAULT_INDIAN_FY_START_YEAR: Final[int] = 2025  # FY 2025-26 = Apr 2025 – Mar 2026


def indian_fy_month_starts(fy_start_year: int) -> list[datetime]:
    """Return 12 month-first datetimes: Apr fy_start_year → Mar fy_start_year+1."""
    out: list[datetime] = []
    y = fy_start_year
    for mo in range(4, 13):
        out.append(datetime(y, mo, 1))
    y2 = fy_start_year + 1
    for mo in range(1, 4):
        out.append(datetime(y2, mo, 1))
    return out


def quarter_slices(months: list[datetime]) -> tuple[list[datetime], list[datetime], list[datetime], list[datetime]]:
    return months[0:3], months[3:6], months[6:9], months[9:12]


def parse_fy_label_to_start_year(label: str | None) -> int:
    """
    Map labels like FY'26, FY2025-26, FY 2025 to Indian FY *start calendar year*.
    Heuristic: 2-digit suffix 26 → 2025 (FY2025-26); 4-digit → use as start year if plausible.
    """
    if not label or not str(label).strip():
        return DEFAULT_INDIAN_FY_START_YEAR
    s = str(label).strip().upper()
    m = re.search(r"20(\d{2})\s*[-–]\s*(\d{2})", s)
    if m:
        return 2000 + int(m.group(1))
    m = re.search(r"FY\s*['']?(\d{2})\b", s)
    if m:
        yy = int(m.group(1))
        return 2000 + yy - 1 if yy <= 50 else 1900 + yy - 1
    m = re.search(r"(20\d{2})", s)
    if m:
        y = int(m.group(1))
        if 2015 <= y <= 2040:
            return y
    return DEFAULT_INDIAN_FY_START_YEAR


def forecast_detail_to_category(detail: str) -> str:
    """Map Forecast Template 'Detail' cell to a closed-list metric_category."""
    d = (detail or "").strip().lower()
    if not d or d == "nan":
        return "Revenue_PlanningOther"
    if "mmf" in d or "management fee" in d:
        return "Revenue_MMF"
    if "joining fee" in d or "joiner fee" in d:
        return "Revenue_JoiningFee"
    if "opening" in d and "fee" in d:
        return "Revenue_OpeningFee"
    if "joiner" in d and "fee" not in d:
        return "Forecast_Joiners"
    if "offer" in d or "tbo" in d or "to be offer" in d or "to-be" in d:
        return "Revenue_ToBeOfferFee"
    return "Revenue_PlanningOther"


def normalize_forecast_cell_inr(val: float) -> float:
    """Match finance ingest heuristic: small magnitudes treated as Lacs → INR."""
    if val is None:
        return 0.0
    try:
        v = float(val)
    except (TypeError, ValueError):
        return 0.0
    if 0 < abs(v) < 2000:
        return v * 100_000.0
    return v


def metric_label_from_category(category: str) -> str:
    """Reverse map for comparison API (display keys)."""
    return {
        "Revenue_MMF": "MMF",
        "Revenue_JoiningFee": "Joining Fee",
        "Revenue_OpeningFee": "Opening Fee",
        "Revenue_ToBeOfferFee": "To Be Offer",
        "Forecast_Joiners": "Joiner",
        "Revenue_PlanningOther": "Other",
    }.get(category, category)
