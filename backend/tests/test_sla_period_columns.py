"""SLA Base File period column discovery and month label parsing."""

from __future__ import annotations

import os

import pandas as pd

from backend.core.sla_period import (
    canonical_month_label,
    discover_sla_period_score_columns,
    parse_sla_month_label,
    parse_sla_score_column_name,
)

_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_MARCH26 = os.path.join(
    _REPO,
    "excel_files_imp",
    "SLA-KPI Performance_FY 25-26_March'26 V1.xlsx",
)


def test_discover_columns_includes_apostrophe_months():
    assert os.path.isfile(_MARCH26), f"fixture missing: {_MARCH26}"
    df = pd.read_excel(_MARCH26, sheet_name="Base File", header=0, nrows=0)
    cols = [str(c).strip() for c in df.columns]
    score_cols = discover_sla_period_score_columns(cols)
    assert "Oct25 Score" in score_cols
    assert "March'26" in score_cols
    assert "Nov'25" in score_cols
    assert "April'26" in score_cols
    assert score_cols.index("March'26") > score_cols.index("Oct25 Score")

    periods = sorted(
        {
            canonical_month_label(parse_sla_score_column_name(c))
            for c in score_cols
            if parse_sla_score_column_name(c)
        }
    )
    assert "2026-03" in periods
    assert periods[-1] >= "2026-03"


def test_parse_apostrophe_and_quarter_labels():
    assert parse_sla_month_label("March'26") == parse_sla_month_label("March26")
    assert canonical_month_label(parse_sla_month_label("March'26")) == "2026-03"
    assert canonical_month_label(parse_sla_month_label("JFM'26")) == "2026-01"
    assert canonical_month_label(parse_sla_month_label("OND'25")) == "2025-10"
