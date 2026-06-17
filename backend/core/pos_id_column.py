"""Resolve Excel position / requisition ID column headers for ingest deduplication."""
from __future__ import annotations

import re
from typing import Optional

# Exact normalized header matches, highest priority first.
_EXACT_PRIORITY = (
    "abg req id",
    "req id",
    "client req id",
    "requisition id",
    "requirement id",
    "job requisition number",
    "job id",
    "job code",
    "position id",
)

# Substrings that look like IDs but are not requisition identifiers.
_FALSE_POSITIVE_SUBSTRINGS = (
    "requirment type",
    "requirement type",
    "req type",
    "req date",
    "date of req",
    "type of req",
)

_WEAK_KEYWORDS = (
    "job id",
    "job code",
    "position id",
    "sl no",
    "reference no",
    "reference id",
)


def _norm_header(header: str) -> str:
    return " ".join(str(header or "").lower().strip().split())


def _is_false_positive(normalized: str) -> bool:
    return any(fp in normalized for fp in _FALSE_POSITIVE_SUBSTRINGS)


def normalize_pos_id_value(val) -> str:
    """Return a clean string ID, or empty when the cell is blank / NaN."""
    if val is None:
        return ""
    try:
        import pandas as pd

        if pd.isna(val):
            return ""
    except Exception:
        pass
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "nat", "-", "n/a"):
        return ""
    # Drop trailing ".0" from Excel numeric req ids (50671.0 → 50671).
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s


def resolve_req_id_from_row(row_dict: dict, pos_id_col_name: Optional[str] = None) -> str:
    """
    Best requisition ID for row identity / deduplication.

    Always prefers a true Req-ID-style column (e.g. ``Req ID``, ``ABG Req ID``) even when
    the project's ``pos_id_column`` is misconfigured to something like Position Title.
    Hyphenated suffix IDs such as ``31964-1`` are preserved as-is.
    """
    if row_dict:
        resolved_col = resolve_pos_id_column(list(row_dict.keys()))
        if resolved_col:
            rid = normalize_pos_id_value(row_dict.get(resolved_col))
            if rid:
                return rid
    if pos_id_col_name:
        return normalize_pos_id_value(row_dict.get(pos_id_col_name))
    return ""


def resolve_pos_id_column(headers: list[str]) -> Optional[str]:
    """
    Pick the tracker column used for requisition / position deduplication.

    Prefers exact ``Req ID``-style headers over columns that merely contain ``req``
    (e.g. ``Requirment Type`` on Ambuja workbooks).
    """
    if not headers:
        return None

    by_norm: dict[str, str] = {}
    for h in headers:
        n = _norm_header(h)
        if n and n not in by_norm:
            by_norm[n] = h

    for pat in _EXACT_PRIORITY:
        if pat in by_norm:
            return by_norm[pat]

    # Headers ending in " id" (e.g. "Internal Req Id") but not false positives.
    for h in headers:
        n = _norm_header(h)
        if _is_false_positive(n):
            continue
        if n.endswith(" id") or re.search(r"\breq\b.*\bid\b", n):
            return h

    for h in headers:
        n = _norm_header(h)
        if _is_false_positive(n):
            continue
        if any(k in n for k in _WEAK_KEYWORDS):
            return h

    return None
