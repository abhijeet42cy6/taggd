"""Score-based matching of candidate tracker rows to existing project requisitions."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.db.database import Record

# Minimum score (0–1) to attach a candidate row to an existing mandate.
MATCH_THRESHOLD = 0.58
# When req id is absent, require stronger title signal if location/division also absent.
MATCH_THRESHOLD_WEAK_CONTEXT = 0.72

_STUB_SOURCE = "candidate_tracker_stub"


def _fold(s: Optional[str]) -> str:
    if not s:
        return ""
    t = unicodedata.normalize("NFKD", str(s).strip().lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", t)


def _ratio(a: Optional[str], b: Optional[str]) -> float:
    fa, fb = _fold(a), _fold(b)
    if not fa or not fb:
        return 0.0
    if fa == fb:
        return 1.0
    if fa in fb or fb in fa:
        return 0.92
    return SequenceMatcher(None, fa, fb).ratio()


def _parse_lpa(val: Any) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip().lower().replace(",", "")
    if s in ("", "-", "na", "n/a", "none", "nan"):
        return None
    s = re.sub(r"\s*lpa\s*", "", s)
    m = re.search(r"([\d.]+)", s)
    if not m:
        return None
    try:
        f = float(m.group(1))
        if f > 500:
            return round(f / 100000.0, 2)
        return round(f, 2)
    except ValueError:
        return None


def _ctc_proximity(a: Optional[float], b: Optional[float]) -> float:
    if a is None or b is None or a <= 0 or b <= 0:
        return 0.0
    diff = abs(a - b) / max(a, b)
    if diff <= 0.05:
        return 1.0
    if diff <= 0.15:
        return 0.75
    if diff <= 0.30:
        return 0.4
    return 0.0


def _cell(row: dict, header: Optional[str]) -> Any:
    if not header:
        return None
    return row.get(header)


def _first_row_value(row_dict: dict, *aliases: str) -> Optional[str]:
    """Read mandate context from mapped headers or raw Excel column names."""
    norm_map = {_fold(k): k for k in row_dict.keys()}
    for alias in aliases:
        key = norm_map.get(_fold(alias))
        if not key:
            continue
        val = row_dict.get(key)
        if val is None or str(val).strip().lower() in ("", "-", "nan", "na", "n/a"):
            continue
        return str(val).strip()[:256]
    return None


@dataclass
class MandateSignals:
    client_req_id: Optional[str] = None
    position_title: Optional[str] = None
    location: Optional[str] = None
    division: Optional[str] = None
    department: Optional[str] = None
    expected_ctc_lpa: Optional[float] = None
    hiring_manager: Optional[str] = None
    assigned_recruiter: Optional[str] = None
    bu_sbu: Optional[str] = None

    @property
    def has_geo_context(self) -> bool:
        return bool(_fold(self.location) or _fold(self.division) or _fold(self.department))


def extract_mandate_signals(row_dict: dict, header_map: Dict[str, str]) -> MandateSignals:
    req_raw = _cell(row_dict, header_map.get("client_req_id"))
    req_id = str(req_raw).strip() if req_raw is not None and str(req_raw).strip().lower() not in ("", "nan") else None
    if req_id and req_id.endswith(".0"):
        req_id = req_id[:-2]

    position = _cell(row_dict, header_map.get("position_title"))
    position_s = str(position).strip() if position is not None and str(position).strip().lower() != "nan" else None

    exp_ctc = _parse_lpa(_cell(row_dict, header_map.get("expected_ctc_lpa")))
    if exp_ctc is None:
        exp_ctc = _parse_lpa(_first_row_value(row_dict, "Expected CTC", "Expected CTC ", "Budget CTC"))

    return MandateSignals(
        client_req_id=req_id,
        position_title=position_s,
        location=_first_row_value(row_dict, "Location", "Job Location", "Work Location")
        or _cell(row_dict, header_map.get("current_location")),
        division=_first_row_value(row_dict, "Division", "Function")
        or _cell(row_dict, header_map.get("rpo_division")),
        department=_first_row_value(row_dict, "Function", "Department"),
        expected_ctc_lpa=exp_ctc,
        hiring_manager=_cell(row_dict, header_map.get("hiring_manager")),
        assigned_recruiter=_cell(row_dict, header_map.get("assigned_recruiter")),
        bu_sbu=_cell(row_dict, header_map.get("rpo_bu_sbu")),
    )


def _is_ingest_stub(rec: Record) -> bool:
    attrs = rec.additional_attributes if isinstance(rec.additional_attributes, dict) else {}
    return attrs.get("source") == _STUB_SOURCE


def _record_ctc(rec: Record) -> Optional[float]:
    if rec.ctc_budget_lpa is not None:
        return float(rec.ctc_budget_lpa)
    attrs = rec.additional_attributes if isinstance(rec.additional_attributes, dict) else {}
    for key in ("ctc_budget_lpa", "Expected CTC", "Budget CTC", "CTC Budget"):
        if key in attrs:
            return _parse_lpa(attrs[key])
    extras = rec.requisition_extras if isinstance(rec.requisition_extras, dict) else {}
    for key in ("ctc_budget_lpa", "expected_ctc", "budget_ctc"):
        if key in extras:
            return _parse_lpa(extras[key])
    return None


def score_record_match(signals: MandateSignals, rec: Record) -> Tuple[float, Dict[str, float]]:
    """Return (total_score, component_scores)."""
    parts: Dict[str, float] = {}

    parts["position"] = _ratio(signals.position_title, rec.position_title) * 0.34
    parts["location"] = _ratio(signals.location, rec.location) * 0.18
    parts["division"] = max(
        _ratio(signals.division, rec.rpo_division),
        _ratio(signals.division, rec.department),
    ) * 0.12
    parts["department"] = _ratio(signals.department, rec.department) * 0.08
    parts["ctc"] = _ctc_proximity(signals.expected_ctc_lpa, _record_ctc(rec)) * 0.10
    parts["hiring_manager"] = _ratio(
        str(signals.hiring_manager) if signals.hiring_manager else None,
        rec.hiring_manager,
    ) * 0.08
    parts["recruiter"] = _ratio(
        str(signals.assigned_recruiter) if signals.assigned_recruiter else None,
        rec.assigned_recruiter_rpo,
    ) * 0.05
    parts["bu"] = _ratio(
        str(signals.bu_sbu) if signals.bu_sbu else None,
        rec.rpo_bu_sbu,
    ) * 0.05

    total = sum(parts.values())

    # Prefer real requisition rows (Express / req tracker) over candidate-ingest stubs.
    if rec.client_req_id and not _is_ingest_stub(rec):
        total += 0.12
    elif rec.client_req_id:
        total += 0.04

    return min(total, 1.0), parts


def mandate_signature(signals: MandateSignals) -> str:
    """Stable grouping key when req id is absent — avoids title-only buckets."""
    if signals.client_req_id:
        return f"req:{_fold(signals.client_req_id)}"
    chunks = [
        _fold(signals.position_title) or "_",
        _fold(signals.location) or "_",
        _fold(signals.division) or "_",
        _fold(signals.department) or "_",
    ]
    return "|".join(chunks)


def find_best_requisition_match(
    db: Session,
    project_id: int,
    signals: MandateSignals,
    *,
    project_records: Optional[List[Record]] = None,
) -> Tuple[Optional[Record], float, Dict[str, float]]:
    """
    Find the best existing mandate for a candidate row.

    Returns (record, score, components). record is None if below threshold.
    """
    if signals.client_req_id:
        return None, 0.0, {}

    records = project_records
    if records is None:
        records = db.query(Record).filter(Record.project_id == project_id).all()

    if not records:
        return None, 0.0, {}

    threshold = MATCH_THRESHOLD if signals.has_geo_context else MATCH_THRESHOLD_WEAK_CONTEXT
    sig = mandate_signature(signals)

    best_rec: Optional[Record] = None
    best_score = 0.0
    best_parts: Dict[str, float] = {}

    for rec in records:
        # Same ingest signature → reuse stub for idempotent re-ingest
        if _is_ingest_stub(rec):
            attrs = rec.additional_attributes if isinstance(rec.additional_attributes, dict) else {}
            if attrs.get("mandate_signature") == sig:
                return rec, 1.0, {"signature": 1.0}

        score, parts = score_record_match(signals, rec)
        if score > best_score:
            best_score = score
            best_rec = rec
            best_parts = parts

    if best_rec is not None and best_score >= threshold:
        return best_rec, best_score, best_parts
    return None, best_score, best_parts
