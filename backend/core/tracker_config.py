"""Per-project tracker upload configuration — validation helpers."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .column_mapping_normalize import (
    build_column_mapping_v3,
    get_status_lexicon_from_mapping,
    split_column_mapping,
)
from .record_field_synonyms import normalize_source_joiner_type
from .status_lexicon import GLOBAL_STATUS_VALUES, normalize_status_key

_FIELD_LABELS: Dict[str, str] = {
    "joining_date": "Joining Date",
    "offered_ctc": "Offered CTC (Lakhs)",
    "status": "Current Status",
    "candidate_name": "Candidate Name",
    "department": "Department",
    "location": "Location",
    "source_joiner_type": "Source Joiner Type",
    "rpo_grade_band": "Band / Grade",
}

_FIX_HINTS: Dict[str, str] = {
    "joining_date": (
        "Fill the Joining Date column for Joined (and Offered, if required) rows. "
        "Open pipeline rows do not need a join date unless your project Config lists "
        "joining_date under Required fields — edit that in Clients → Edit account → Config."
    ),
    "offered_ctc": (
        "Enter Offered CTC (Lakhs) on Joined and Offered rows (e.g. 12 for ₹12 L). "
        "If the row is still Open, either add a budget/CTC or remove offered_ctc from "
        "Required fields in Clients → Edit account → Config."
    ),
    "status": (
        "Set Current Status from the Excel dropdown on every data row "
        "(Open, Screening, Interview, Offered, Joined, On Hold, Cancelled, Rejected, or Closed)."
    ),
    "candidate_name": (
        "Fill Candidate Name for every row. For open positions with no candidate yet, "
        "use a placeholder like 'Open — REQ-001' or remove candidate_name from Required fields "
        "in Clients → Edit account → Config."
    ),
}

_CANONICAL_TO_GLOBAL: Dict[str, str] = {
    "Open": "ACTIVE",
    "Joined": "CLOSED",
    "Offered": "PIPELINE",
    "Interview": "PIPELINE",
    "Screening": "PIPELINE",
    "On Hold": "ON HOLD",
    "Cancelled": "CANCELLED",
    "Closed": "CLOSED",
    "Rejected": "CANCELLED",
}

_WARN_FIX_HINTS: Dict[str, str] = {
    "valid_bands": (
        "Change Band / Grade to one of the values in your project Config, "
        "or add this band under Clients → Edit account → Config → Valid bands."
    ),
    "valid_departments": (
        "Change Department to a value listed in your project Config, "
        "or add it under Clients → Edit account → Config → Valid departments."
    ),
    "valid_locations": (
        "Change Location to a value listed in your project Config, "
        "or add it under Clients → Edit account → Config → Valid locations."
    ),
}


def merge_tracker_config(
    existing: Optional[dict],
    patch: Optional[dict],
) -> dict:
    """Deep-merge tracker_config patches (lists replaced when provided)."""
    base: dict = dict(existing or {})
    if not patch:
        return base
    for key, val in patch.items():
        if val is None:
            base.pop(key, None)
        elif isinstance(val, list):
            base[key] = list(val)
        elif isinstance(val, dict) and isinstance(base.get(key), dict):
            base[key] = {**base[key], **val}
        else:
            base[key] = val
    return base


def _norm_list(config: dict, key: str) -> List[str]:
    raw = config.get(key)
    if not isinstance(raw, list):
        return []
    return [str(v).strip() for v in raw if str(v).strip()]


def _is_empty(val) -> bool:
    return val is None or str(val).strip() in ("", "nan", "None", "NaT")


def _header_set(headers: List[str]) -> set[str]:
    return {str(h).strip() for h in headers if str(h).strip()}


def build_mapping_from_aliases(
    aliases: Dict[str, str],
    headers: List[str],
    existing_mapping: Any,
) -> dict:
    """
    Build column_mapping v3 from tracker_config column_aliases.

    Merges alias overrides into any existing pinned mapping; only maps headers
    that exist in the uploaded file.
    """
    uni_existing, rf_existing = split_column_mapping(existing_mapping)
    header_set = _header_set(headers)
    uni = dict(uni_existing)
    for u_key, excel_header in (aliases or {}).items():
        if not isinstance(u_key, str) or not isinstance(excel_header, str):
            continue
        h = excel_header.strip()
        if h and h in header_set:
            uni[u_key] = h
    rf = dict(rf_existing)
    lex = get_status_lexicon_from_mapping(existing_mapping)
    return build_column_mapping_v3(uni, rf, status_lexicon=lex)


def merge_status_vocabulary_into_mapping(
    column_mapping_payload: dict,
    status_vocabulary: Optional[Dict[str, str]],
) -> dict:
    """Overlay admin-configured status_vocabulary onto the mapping's status lexicon."""
    if not status_vocabulary or not isinstance(status_vocabulary, dict):
        return column_mapping_payload

    uni, rf = split_column_mapping(column_mapping_payload)
    lex = get_status_lexicon_from_mapping(column_mapping_payload) or {}
    value_map: Dict[str, Dict[str, str]] = dict(lex.get("value_map") or {})

    for raw, canonical in status_vocabulary.items():
        if not isinstance(raw, str) or not isinstance(canonical, str):
            continue
        key = normalize_status_key(raw)
        canonical = canonical.strip() or "Open"
        gs = _CANONICAL_TO_GLOBAL.get(canonical, "PIPELINE")
        if gs not in GLOBAL_STATUS_VALUES:
            gs = "PIPELINE"
        value_map[key] = {
            "global_status": gs,
            "canonical_status": canonical,
            "source": "config",
        }

    status_header = (uni.get("status") or "").strip()
    if not lex:
        lex = {
            "primary_column": status_header or None,
            "candidate_status_column": status_header or None,
            "mandate_status_column": status_header or None,
            "row_selection_rule": "primary_only",
            "inventory": {},
            "unmapped_values": [],
            "coverage_pct": 100.0,
        }
    lex = {**lex, "value_map": value_map}
    return build_column_mapping_v3(uni, rf, status_lexicon=lex)


def synthesize_logic_from_fee_model(fee_model: dict) -> str:
    """Return RestrictedPython-compatible revenue logic from tracker_config.fee_model."""
    fee_type = str(fee_model.get("type") or "percentage").strip().lower()
    ctc_unit = str(fee_model.get("ctc_unit") or "lakhs").strip().lower()
    multiplier = "100000" if ctc_unit == "lakhs" else "1"

    if fee_type == "flat_fee":
        flat = float(fee_model.get("flat_fee_per_joiner") or 0)
        return f'''def calculate(row):
    status_str = str(row.get("Current Status") or row.get("Status") or "").strip().lower()
    joined = any(x in status_str for x in ("joined", "hired", "selected"))
    if joined:
        return {{"revenue": {flat}, "opening_fee": 0.0, "closing_fee": {flat}, "status": "Joined"}}
    return {{"revenue": 0.0, "opening_fee": 0.0, "closing_fee": 0.0, "status": status_str or "Open"}}
'''

    closing_pct = float(fee_model.get("closing_fee_pct") or 0)
    opening_pct = float(fee_model.get("opening_fee_pct") or 0)
    return f'''def calculate(row):
    status_str = str(row.get("Current Status") or row.get("Status") or "").strip().lower()
    ctc_raw = (
        row.get("Offered CTC (Lakhs)")
        or row.get("Offered CTC")
        or row.get("CTC offered")
        or row.get("Offered Gross CTC")
        or 0
    )
    try:
        ctc = float(ctc_raw or 0)
    except (TypeError, ValueError):
        ctc = 0.0
    ctc_inr = ctc * {multiplier}
    joined = any(x in status_str for x in ("joined", "hired", "selected"))
    offered = any(x in status_str for x in ("offer", "ytj", "tbo", "documentation"))
    opening_fee = ctc_inr * {opening_pct} if ctc_inr > 0 and not joined else 0.0
    closing_fee = ctc_inr * {closing_pct} if joined and ctc_inr > 0 else 0.0
    if not joined and offered and closing_fee == 0.0 and ctc_inr > 0:
        closing_fee = ctc_inr * {closing_pct}
    revenue = opening_fee + closing_fee
    return {{
        "revenue": revenue,
        "opening_fee": opening_fee,
        "closing_fee": closing_fee,
        "status": status_str or "Open",
    }}
'''


def _resolve_header_for_field(
    field: str,
    record_fields_map: dict,
    config: Optional[dict],
) -> Optional[str]:
    aliases = (config or {}).get("column_aliases") or {}
    if isinstance(aliases, dict):
        alias = aliases.get(field)
        if isinstance(alias, str) and alias.strip():
            return alias.strip()
    for f, h in (record_fields_map or {}).items():
        if f == field and h:
            return str(h)
    mapping = {
        "department": "Department",
        "location": "Location",
        "source_joiner_type": "Source Joiner Type",
        "rpo_grade_band": "Band / Grade",
        "status": "Current Status",
        "joining_date": "Joining Date",
        "offered_ctc": "Offered CTC (Lakhs)",
        "candidate_name": "Candidate Name",
        "position_title": "Position Title",
        "req_id": "Req ID",
    }
    return mapping.get(field)


def validate_row_against_tracker_config(
    universal_data: dict,
    row_dict: dict,
    record_fields_map: dict,
    config: Optional[dict],
    excel_row: int,
) -> Tuple[List[dict], List[dict]]:
    """Return (warnings, errors) dicts for a parsed row."""
    if not config:
        return [], []

    warnings: List[dict] = []
    errors: List[dict] = []

    def _header_for_field(field: str) -> Optional[str]:
        return _resolve_header_for_field(field, record_fields_map, config)

    def _cell_value(field: str, u_key: Optional[str] = None):
        if u_key and not _is_empty(universal_data.get(u_key)):
            return universal_data.get(u_key)
        header = _header_for_field(field)
        if header and not _is_empty(row_dict.get(header)):
            return row_dict.get(header)
        return None

    checks = [
        ("valid_bands", "rpo_grade_band", None, "Band / Grade"),
        ("valid_departments", "department", "department", "Department"),
        ("valid_locations", "location", "location", "Location"),
    ]
    for cfg_key, field, u_key, label in checks:
        allowed = _norm_list(config, cfg_key)
        if not allowed:
            continue
        val = _cell_value(field, u_key)
        if val is not None and str(val).strip() and str(val).strip() not in allowed:
            warnings.append(
                {
                    "row": excel_row,
                    "field": label,
                    "raw": str(val).strip(),
                    "issue": f"Value not in configured {cfg_key}: {allowed[:8]}",
                    "fix": _WARN_FIX_HINTS.get(cfg_key),
                }
            )

    allowed_sjt = _norm_list(config, "valid_source_joiner_types")
    if allowed_sjt:
        sjt_header = _header_for_field("source_joiner_type")
        sjt_raw = ""
        if sjt_header and row_dict.get(sjt_header) not in (None, ""):
            sjt_raw = str(row_dict.get(sjt_header)).strip()
        sjt = normalize_source_joiner_type(sjt_raw) if sjt_raw else None
        if sjt and sjt not in allowed_sjt:
            warnings.append(
                {
                    "row": excel_row,
                    "field": "Source Joiner Type",
                    "raw": sjt_raw,
                    "issue": f"Source joiner type not in configured list: {allowed_sjt}",
                    "fix": (
                        "Pick a Source Joiner Type from your Config list, "
                        "or add this type under Clients → Edit account → Config."
                    ),
                }
            )

    required = config.get("required_fields") or []
    if isinstance(required, list):
        for req in required:
            req_key = str(req).strip()
            if not req_key:
                continue
            val = _cell_value(req_key, req_key)
            if _is_empty(val):
                label = _FIELD_LABELS.get(req_key, req_key)
                errors.append(
                    {
                        "row": excel_row,
                        "field": req_key,
                        "field_label": label,
                        "issue": f"Required column {label!r} is empty on this row",
                        "fix": _FIX_HINTS.get(
                            req_key,
                            f"Fill {label} in the Excel file or remove {req_key!r} from "
                            "Required fields in Clients → Edit account → Config.",
                        ),
                    }
                )

    return warnings, errors
