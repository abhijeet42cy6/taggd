"""Heuristic Excel header → Candidate field mapping for tracker workbooks."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set, Tuple

INGESTABLE_CANDIDATE_FIELDS: Set[str] = frozenset(
    {
        "full_name",
        "email_id",
        "contact_no",
        "gender",
        "current_location",
        "qualification",
        "total_experience_yrs",
        "current_organization",
        "current_designation",
        "notice_period_days",
        "current_ctc_lpa",
        "expected_ctc_lpa",
        "assigned_recruiter",
        "hiring_manager",
        "sourcer_name",
        "current_stage",
        "expected_doj",
        "actual_doj",
        "selection_date",
        "offer_date",
        "source_of_hire",
        "client_req_id",
        "position_title",
        "rpo_bu_sbu",
        "rpo_division",
    }
)

# (field, normalized alias, weight)
_FIELD_ALIAS_WEIGHTS: List[Tuple[str, str, int]] = [
    ("full_name", "candidate name", 95),
    ("full_name", "name", 55),
    ("email_id", "email id", 92),
    ("email_id", "emailid", 90),
    ("email_id", "email", 70),
    ("contact_no", "contact no", 90),
    ("contact_no", "contact number", 88),
    ("contact_no", "phone", 65),
    ("gender", "gender", 85),
    ("current_location", "current location", 90),
    ("current_location", "current loc", 88),
    ("current_location", "location", 50),
    ("qualification", "qualification", 85),
    ("qualification", "education", 80),
    ("total_experience_yrs", "total experience", 90),
    ("total_experience_yrs", "experience", 55),
    ("total_experience_yrs", "relevant experience", 75),
    ("current_organization", "current org", 88),
    ("current_organization", "current co", 85),
    ("current_designation", "curr designation", 90),
    ("current_designation", "current designation", 88),
    ("notice_period_days", "notice period", 88),
    ("current_ctc_lpa", "current ctc", 88),
    ("expected_ctc_lpa", "expected ctc", 88),
    ("assigned_recruiter", "recruiter", 75),
    ("hiring_manager", "hm name", 90),
    ("hiring_manager", "hiring manager", 88),
    ("sourcer_name", "sourcer", 80),
    ("current_stage", "final status", 92),
    ("current_stage", "status", 60),
    ("expected_doj", "doj", 85),
    ("expected_doj", "date of joining", 88),
    ("actual_doj", "actual doj", 88),
    ("selection_date", "final selection date", 92),
    ("selection_date", "selection", 55),
    ("offer_date", "offer date", 88),
    ("source_of_hire", "source mix", 85),
    ("source_of_hire", "name of the source", 80),
    ("client_req_id", "req no", 92),
    ("client_req_id", "req number", 88),
    ("client_req_id", "req id", 85),
    ("client_req_id", "alt id", 80),
    ("client_req_id", "reference id", 85),
    ("position_title", "position name", 92),
    ("position_title", "position title", 90),
    ("rpo_bu_sbu", "bu", 55),
    ("rpo_bu_sbu", "business unit", 85),
    ("rpo_division", "division", 75),
    ("rpo_division", "function", 50),
]

_IGNORE_HEADER_PATTERNS = (
    "sl no",
    "sr no",
    "serial",
    "s.no",
    "row index",
)


def _norm_header(h: str) -> str:
    s = re.sub(r"\s+", " ", (h or "").strip().lower())
    s = s.replace("\xa0", " ")
    return s


def _should_ignore_header(nh: str) -> bool:
    if not nh:
        return True
    return any(p in nh for p in _IGNORE_HEADER_PATTERNS)


def heuristic_candidate_field_map(headers: List[str]) -> Dict[str, str]:
    """Return {candidate_field: exact_excel_header} using weighted alias matching."""
    used_headers: Set[str] = set()
    out: Dict[str, str] = {}
    scored: List[Tuple[int, str, str]] = []

    for raw in headers:
        if raw is None or not str(raw).strip():
            continue
        exact = str(raw)
        nh = _norm_header(exact)
        if _should_ignore_header(nh):
            continue
        for field, alias, weight in _FIELD_ALIAS_WEIGHTS:
            if field not in INGESTABLE_CANDIDATE_FIELDS:
                continue
            if nh == alias or (len(alias) >= 6 and alias in nh):
                scored.append((weight, field, exact))

    scored.sort(key=lambda t: (-t[0], t[1], t[2]))
    for _w, field, exact in scored:
        if field in out or exact in used_headers:
            continue
        out[field] = exact
        used_headers.add(exact)

    return out


def mapped_headers_set(header_map: Dict[str, str]) -> frozenset[str]:
    return frozenset(h for h in header_map.values() if h)
