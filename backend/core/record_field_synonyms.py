"""
Heuristic header → `Record` column matching for RPO / requisition ingest.

Used to augment the LLM column mapper: fills `record_fields` when the model omits mappings.
Each Excel column is assigned to at most one target field; universal-mapped headers are skipped.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Set, Tuple

# ORM columns we may set from sheet cells (not universal keys — those use `universal` map).
INGESTABLE_RECORD_COLUMNS: Set[str] = frozenset(
    {
        "client_req_id",
        "rpo_client_name",
        "positions_open",
        "rpo_priority",
        "rpo_job_type",
        "experience_years_required",
        "ctc_budget_lpa",
        "rpo_source_of_hire",
        "rpo_sub_source",
        "profiles_sourced",
        "profiles_submitted",
        "interviews_scheduled",
        "offers_released",
        "offers_accepted",
        "assigned_recruiter_rpo",
        "rpo_mandate_status",
        "rpo_vertical",
        "rpo_division",
        "rpo_bu_sbu",
        "rpo_zone",
        "rpo_grade_band",
        "rpo_business_hrbp",
        "rpo_sourcer",
        "rpo_taggd_pm",
        "rpo_hiring_agency",
        "rpo_ijp_referral",
        "mandate_received_date",
        "intake_date",
        "first_cv_share_date",
        "selection_date_req",
        "loi_date_req",
        "closure_date_req",
        "rpo_stage",
        "ageing_days",
        "ageing_bracket",
        "dead_days",
        "tto_days",
        "ttf_days",
        "taggd_fees_amount",
        "billing_month",
        "fy_label",
    }
)

_INT_FIELDS = frozenset(
    {
        "positions_open",
        "profiles_sourced",
        "profiles_submitted",
        "interviews_scheduled",
        "offers_released",
        "offers_accepted",
        "ageing_days",
        "dead_days",
        "tto_days",
        "ttf_days",
    }
)
_FLOAT_FIELDS = frozenset({"ctc_budget_lpa", "taggd_fees_amount"})
_DATE_FIELDS = frozenset(
    {
        "mandate_received_date",
        "intake_date",
        "first_cv_share_date",
        "selection_date_req",
        "loi_date_req",
        "closure_date_req",
    }
)

# (field_name, normalized_alias, weight) — weight higher = more specific; matched if alias == nh or (len>=6 and alias in nh)
_FIELD_ALIAS_WEIGHTS: List[Tuple[str, str, int]] = [
    # Exact short headers (win over fuzzy nh-in-alias matches)
    ("rpo_source_of_hire", "source", 92),
    ("client_req_id", "reference id", 95),
    ("client_req_id", "abg req id", 92),
    ("client_req_id", "job req id", 90),
    ("client_req_id", "requisition id", 88),
    ("client_req_id", "job requisition id", 88),
    ("client_req_id", "req no", 85),
    ("client_req_id", "req number", 85),
    ("client_req_id", "req id", 80),
    ("rpo_client_name", "client name", 70),
    ("rpo_client_name", "customer name", 68),
    ("positions_open", "positions open", 75),
    ("positions_open", "open positions", 75),
    ("positions_open", "no of positions", 72),
    ("rpo_priority", "priority", 55),
    ("rpo_job_type", "job type", 60),
    ("rpo_job_type", "new hire replacement", 75),
    ("rpo_job_type", "hire type", 65),
    ("experience_years_required", "years of experience", 85),
    ("experience_years_required", "yrs of experience", 82),
    ("experience_years_required", "total experience", 78),
    ("experience_years_required", "relevant experience", 76),
    ("experience_years_required", "experience required", 80),
    ("ctc_budget_lpa", "ctc budget", 80),
    ("ctc_budget_lpa", "budget lpa", 78),
    ("ctc_budget_lpa", "max salary", 72),
    ("ctc_budget_lpa", "min salary", 65),
    ("rpo_source_of_hire", "source of hire", 85),
    ("rpo_source_of_hire", "source mix", 70),
    ("rpo_source_of_hire", "source details", 72),
    ("rpo_sub_source", "sub source", 80),
    ("rpo_sub_source", "source name", 78),
    ("rpo_sub_source", "referred by", 70),
    ("rpo_sub_source", "refered by", 68),
    ("profiles_sourced", "profiles sourced", 85),
    ("profiles_sourced", "profiles sourced", 85),
    ("profiles_submitted", "profiles submitted", 85),
    ("profiles_submitted", "submitted to client", 78),
    ("interviews_scheduled", "interviews scheduled", 88),
    ("interviews_scheduled", "interview result", 65),
    ("offers_released", "offers released", 88),
    ("offers_accepted", "offers accepted", 88),
    ("assigned_recruiter_rpo", "assigned recruiter", 88),
    ("assigned_recruiter_rpo", "recruiter", 60),
    ("rpo_mandate_status", "mandate status", 85),
    ("rpo_mandate_status", "req status", 80),
    ("rpo_mandate_status", "final status", 78),
    ("rpo_mandate_status", "job requisition status", 88),
    ("rpo_vertical", "vertical", 58),
    ("rpo_division", "division", 55),
    ("rpo_division", "sub division", 75),
    ("rpo_bu_sbu", "business unit", 82),
    ("rpo_bu_sbu", "bu", 45),
    ("rpo_zone", "zone", 50),
    ("rpo_zone", "region", 52),
    ("rpo_grade_band", "grade band", 85),
    ("rpo_grade_band", "grade", 48),
    ("rpo_business_hrbp", "business hrbp", 85),
    ("rpo_business_hrbp", "hrbp", 60),
    ("rpo_sourcer", "sourcer", 70),
    ("rpo_sourcer", "sourcer name", 85),
    ("rpo_taggd_pm", "taggd pm", 85),
    ("rpo_taggd_pm", "ta spoc", 78),
    ("rpo_hiring_agency", "hiring agency", 85),
    ("rpo_ijp_referral", "ijp", 40),
    ("rpo_ijp_referral", "ijp referral", 80),
    ("mandate_received_date", "req received", 88),
    ("mandate_received_date", "mandate received", 90),
    ("mandate_received_date", "requisition received", 88),
    ("intake_date", "intake date", 88),
    ("intake_date", "intake meeting date", 90),
    ("intake_date", "job posting date", 82),
    ("first_cv_share_date", "cv shared", 88),
    ("first_cv_share_date", "first cv share", 90),
    ("first_cv_share_date", "sourcing date", 78),
    ("selection_date_req", "selection date", 85),
    ("selection_date_req", "date of selection", 88),
    ("loi_date_req", "loi date", 82),
    ("loi_date_req", "loi issue", 78),
    ("closure_date_req", "closure date", 85),
    ("closure_date_req", "closed date", 82),
    ("rpo_stage", "rpo stage", 88),
    ("rpo_stage", "current stage", 80),
    ("rpo_stage", "candidate stage", 78),
    ("ageing_days", "ageing days", 88),
    ("ageing_days", "aging days", 86),
    ("ageing_bracket", "ageing bracket", 88),
    ("ageing_bracket", "aging bracket", 86),
    ("ageing_bracket", "ageing", 55),
    ("dead_days", "dead days", 85),
    ("tto_days", "tto", 50),
    ("tto_days", "time to offer", 85),
    ("ttf_days", "ttf", 50),
    ("ttf_days", "time to fill", 85),
    ("taggd_fees_amount", "taggd fee", 85),
    ("taggd_fees_amount", "fee amount", 70),
    ("billing_month", "billing month", 88),
    ("fy_label", "fy label", 80),
    ("fy_label", "fiscal year", 78),
    ("fy_label", "financial year", 78),
]


def normalize_header(s: str) -> str:
    t = str(s).strip().lower()
    t = re.sub(r"[\s_/\-]+", " ", t)
    t = re.sub(r"[^a-z0-9 ]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _whole_word(haystack_words: str, needle: str) -> bool:
    """True if `needle` appears as a full token in haystack_words (space-delimited)."""
    if not needle:
        return False
    return needle in frozenset(haystack_words.split())


def _score_header_to_alias(nh: str, alias: str, weight: int) -> int:
    if not nh or not alias:
        return 0
    if nh == alias:
        return weight + 50
    if len(alias) >= 6 and alias in nh:
        return weight
    # nh contained in multi-word alias only as whole word (avoid "source" ⊂ "profiles sourced")
    if len(alias) >= 5 and len(nh) >= 3 and _whole_word(alias, nh):
        return weight - 15
    # token overlap: every alias word appears in header
    aw = [w for w in alias.split() if len(w) > 1]
    if len(aw) >= 2 and all(w in nh for w in aw):
        return weight - 25
    return 0


def suggest_record_field_mapping(
    headers: List[str],
    universal_mapped_headers: Set[str],
) -> Dict[str, str]:
    """
    Greedy best match: each header used once; each field wins at most one header.
    Skips headers already used by the universal map (exact string match to Excel column name).
    """
    candidates: List[Tuple[int, str, str]] = []  # score, field, original_header
    uh = {str(h) for h in universal_mapped_headers if h}

    for orig in headers:
        os = str(orig).strip()
        if not os or os in uh:
            continue
        nh = normalize_header(os)
        if not nh:
            continue
        for field, alias, wgt in _FIELD_ALIAS_WEIGHTS:
            if field not in INGESTABLE_RECORD_COLUMNS:
                continue
            sc = _score_header_to_alias(nh, alias, wgt)
            if sc > 0:
                candidates.append((sc, field, os))

    candidates.sort(key=lambda x: -x[0])
    used_headers: Set[str] = set()
    used_fields: Set[str] = set()
    out: Dict[str, str] = {}
    for sc, field, hdr in candidates:
        if field in used_fields or hdr in used_headers:
            continue
        out[field] = hdr
        used_fields.add(field)
        used_headers.add(hdr)
    return out


def merge_llm_and_heuristic_record_fields(
    llm_record_fields: Dict[str, str],
    headers: List[str],
    universal: Dict[str, str],
) -> Dict[str, str]:
    """LLM mappings win; heuristic fills only missing fields; drops invalid keys and duplicate headers."""
    uni_vals = {str(v).strip() for v in universal.values() if isinstance(v, str) and str(v).strip()}
    merged: Dict[str, str] = {}
    used_headers: Set[str] = set()

    for k, v in (llm_record_fields or {}).items():
        if k not in INGESTABLE_RECORD_COLUMNS or not isinstance(v, str) or not v.strip():
            continue
        vs = v.strip()
        if vs in uni_vals or vs in used_headers:
            continue
        merged[k] = vs
        used_headers.add(vs)

    heur = suggest_record_field_mapping(headers, uni_vals | used_headers)
    for field, hdr in heur.items():
        if field in merged:
            continue
        if hdr in used_headers or hdr in uni_vals:
            continue
        merged[field] = hdr
        used_headers.add(hdr)
    return merged


def field_coercion_kind(field: str) -> str:
    if field in _DATE_FIELDS:
        return "date"
    if field in _INT_FIELDS:
        return "int"
    if field in _FLOAT_FIELDS:
        return "float"
    return "str"
