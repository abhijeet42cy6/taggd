"""Read Taggd standard tracker sheets — skip banner/hint rows."""
from __future__ import annotations

from typing import Optional, Tuple

import pandas as pd

from .pos_id_column import normalize_pos_id_value

# 1-indexed Excel row where first real data row lives (after header row 2 + hint row 3).
STANDARD_TEMPLATE_DATA_START_ROW = 4

_HEADER_LITERALS = frozenset(
    {
        "position title",
        "band / grade",
        "current status",
        "candidate name",
        "department",
        "location",
        "req id",
        "source joiner type",
        "joining date",
        "offered ctc (lakhs)",
    }
)


def _is_standard_taggd_template(probe: pd.DataFrame) -> bool:
    if probe.shape[0] < 2 or probe.shape[1] < 2:
        return False
    return str(probe.iloc[1, 1]).strip().lower() == "req id"


def read_tracker_sheet_dataframe(
    filepath: str,
    sheet_name: str,
) -> Tuple[pd.DataFrame, int]:
    """
    Load tracker sheet. For the standard Taggd template (header on Excel row 2),
    uses header=1 and drops the column-hint row. Returns (dataframe, data_start_excel_row).
    """
    probe = pd.read_excel(filepath, sheet_name=sheet_name, header=None, nrows=4)
    if _is_standard_taggd_template(probe):
        df = pd.read_excel(filepath, sheet_name=sheet_name, header=1)
        if len(df):
            first_req = df.iloc[0].get("Req ID")
            if first_req is not None and str(first_req).strip().startswith("["):
                df = df.iloc[1:].reset_index(drop=True)
        return df, STANDARD_TEMPLATE_DATA_START_ROW
    return pd.read_excel(filepath, sheet_name=sheet_name), 1


def is_tracker_template_junk_row(
    row_dict: dict,
    pos_id_col_name: Optional[str],
    universal_data: dict,
) -> bool:
    """True when this row is a banner, header echo, or hint row — not real data."""
    title = str(universal_data.get("position_title") or "").strip().lower()
    if title in _HEADER_LITERALS:
        return True
    if title.startswith("[must fill]") or title.startswith("["):
        return True

    pos_header = pos_id_col_name or "Req ID"
    raw_id = row_dict.get(pos_header)
    if raw_id is None:
        raw_id = row_dict.get("Req ID")
    rid = str(raw_id or "").strip().lower()
    if rid in ("req id",):
        return True
    if rid.startswith("[must fill]") or (rid.startswith("[") and "fill" in rid):
        return True

    if not normalize_pos_id_value(raw_id):
        blob = " ".join(str(v).lower() for v in row_dict.values() if v is not None)
        if "delete these example" in blob or "scenario (example rows only)" in blob:
            return True
        if title in _HEADER_LITERALS or not title:
            if "must fill" in blob:
                return True

    cand = str(universal_data.get("candidate_name") or row_dict.get("Candidate Name") or "").strip().lower()
    if cand in ("candidate name",):
        return True

    return False
