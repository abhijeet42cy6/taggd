"""Parse `Project.column_mapping` JSON: legacy flat universal map vs v2 structured payload."""

from __future__ import annotations

from typing import Any, Dict, Tuple

COLUMN_MAPPING_VERSION = 2
KEY_VERSION = "version"
KEY_UNIVERSAL = "universal"
KEY_RECORD_FIELDS = "record_fields"


def split_column_mapping(raw: Any) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Returns (universal_key -> excel_header, record_field -> excel_header).

    Legacy: `raw` is a flat dict mapping universal keys only (candidate_name, …).
    v2: {"version": 2, "universal": {...}, "record_fields": {...}}.
    """
    if not isinstance(raw, dict) or not raw:
        return {}, {}

    if KEY_UNIVERSAL in raw and isinstance(raw[KEY_UNIVERSAL], dict):
        uni = {k: v for k, v in raw[KEY_UNIVERSAL].items() if isinstance(k, str) and isinstance(v, str) and v.strip()}
        rec = raw.get(KEY_RECORD_FIELDS) or {}
        if isinstance(rec, dict):
            rf = {k: v for k, v in rec.items() if isinstance(k, str) and isinstance(v, str) and v.strip()}
        else:
            rf = {}
        return uni, rf

    # Flat legacy: all string values treated as universal mapping
    uni = {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, str) and v.strip()}
    return uni, {}


def build_column_mapping_v2(universal: Dict[str, str], record_fields: Dict[str, str]) -> Dict[str, Any]:
    """Persistable JSON for `Project.column_mapping`."""
    return {
        KEY_VERSION: COLUMN_MAPPING_VERSION,
        KEY_UNIVERSAL: dict(universal),
        KEY_RECORD_FIELDS: dict(record_fields),
    }


def all_mapped_excel_headers(universal: Dict[str, str], record_fields: Dict[str, str]) -> frozenset[str]:
    """Exact Excel header strings consumed by mapping (excluded from additional_attributes)."""
    h = set()
    for v in universal.values():
        if isinstance(v, str) and v.strip():
            h.add(v)
    for v in record_fields.values():
        if isinstance(v, str) and v.strip():
            h.add(v)
    return frozenset(h)
