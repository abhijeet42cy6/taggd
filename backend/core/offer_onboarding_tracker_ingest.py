"""Pass 3: Offer & Onboarding sheet ingest — gap-fill on existing `candidates` rows."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from backend.core.candidate_tracker_ingest import (
    _cell,
    _is_na,
    _parse_ctc_lpa,
    _parse_notice_days,
    _safe_date,
    _str_val,
)
from backend.core.offer_onboarding_query import excel_candidate_id_from_row
from backend.db.database import Candidate, Record

logger = logging.getLogger(__name__)

OFFER_SHEET_KEYWORDS = ("offer", "onboarding")
OFFER_HEADER_ROW = 3  # 0-indexed row for column headers

# (normalized header fragment, target_kind, target_key)
# kind: column | extras
_FIELD_SPECS: List[Tuple[str, str, str]] = [
    ("offer date", "column", "offer_date"),
    ("offer accepted", "column", "offer_accepted_flag"),
    ("decline reason", "column", "decline_reason"),
    ("expected doj", "column", "expected_doj"),
    ("actual doj", "column", "actual_doj"),
    ("joining status", "column", "joining_status"),
    ("30-day check-in", "column", "checkin_30_day"),
    ("60-day check-in", "column", "checkin_60_day"),
    ("90-day retention", "column", "checkin_90_day"),
    ("early exit risk", "column", "early_exit_risk"),
    ("offered ctc", "column", "offer_ctc_lpa"),
    ("offered gross ctc", "column", "offered_gross_ctc"),
    ("offered stvs", "column", "offered_stvs"),
    ("% hike offered", "column", "hike_pct_offered"),
    ("deviation comments", "extras", "deviation_comments"),
    ("deviation", "extras", "deviation"),
    ("selection date", "column", "selection_date"),
    ("c&b closure date", "column", "cb_closure_date"),
    ("loi issue date", "column", "loi_issue_date"),
    ("letter sent date", "extras", "letter_sent_date"),
    ("letter accepted date", "extras", "letter_accepted_date"),
    ("document shared with taq date", "extras", "document_shared_with_taq_date"),
    ("medical initiation date", "column", "medical_initiation_date"),
    ("bgv date", "column", "bgv_date"),
    ("bgv status", "column", "bgv_status"),
    ("gender", "column", "gender"),
    ("source of hire", "column", "source_of_hire"),
    ("notice period (days)", "column", "notice_period_days"),
    ("notice period buyout amount", "extras", "notice_period_buyout_amount"),
    ("candidate staff no", "column", "candidate_staff_no"),
    ("msil staff no", "column", "msil_staff_no"),
    ("recruiter name", "column", "assigned_recruiter"),
    ("sourcer name", "column", "sourcer_name"),
    ("taggd pm", "column", "taggd_pm"),
    ("employement type", "extras", "employment_type"),
    ("employment type", "extras", "employment_type"),
    ("duration", "extras", "duration"),
    ("remarks", "extras", "remarks"),
]

_EXTRAS_CANONICAL_KEYS = frozenset(
    {
        "deviation",
        "deviation_comments",
        "letter_sent_date",
        "letter_accepted_date",
        "document_shared_with_taq_date",
        "notice_period_buyout_amount",
        "employment_type",
        "duration",
        "remarks",
    }
)


def _norm_header(h: str) -> str:
    s = re.sub(r"\s+", " ", (h or "").strip().lower())
    s = s.replace("\xa0", " ").replace("★", "").strip()
    return s


def detect_offer_onboarding_sheet(sheet_names: List[str]) -> Optional[str]:
    for name in sheet_names:
        nl = _norm_header(name)
        if "offer" in nl and "onboard" in nl:
            return name
    for name in sheet_names:
        nl = _norm_header(name)
        if any(k in nl for k in OFFER_SHEET_KEYWORDS):
            return name
    return None


def _build_header_map(headers: List[str]) -> Dict[str, Tuple[str, str, str]]:
    """Return {exact_excel_header: (kind, key, normalized_fragment)}."""
    out: Dict[str, Tuple[str, str, str]] = {}
    used: Set[str] = set()
    for raw in headers:
        if raw is None or not str(raw).strip():
            continue
        exact = str(raw)
        nh = _norm_header(exact)
        if not nh or nh.startswith("unnamed"):
            continue
        best: Optional[Tuple[int, str, str, str]] = None
        for fragment, kind, key in _FIELD_SPECS:
            if nh == fragment or (len(fragment) >= 8 and fragment in nh) or nh.startswith(fragment):
                score = len(fragment)
                if nh == fragment:
                    score += 50
                if best is None or score > best[0]:
                    best = (score, kind, key, fragment)
        if best and exact not in used:
            _, kind, key, fragment = best
            out[exact] = (kind, key, fragment)
            used.add(exact)
    return out


def _is_empty_db_value(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and not val.strip():
        return True
    return False


def _extras_has_value(extras: Optional[dict], key: str) -> bool:
    if not isinstance(extras, dict):
        return False
    for k, v in extras.items():
        if _norm_header(str(k)) == _norm_header(key) and not _is_empty_db_value(v):
            return True
    return False


def _candidate_extras_has_semantic(extras: Optional[dict], key: str) -> bool:
    if not isinstance(extras, dict):
        return False
    nk = _norm_header(key)
    for k, v in extras.items():
        if _norm_header(str(k)) == nk and not _is_empty_db_value(v):
            return True
    return False


def _coerce_value(kind: str, key: str, raw: Any) -> Any:
    if kind == "column":
        if key in ("offer_date", "expected_doj", "actual_doj", "selection_date", "cb_closure_date", "loi_issue_date", "bgv_date", "medical_initiation_date"):
            return _safe_date(raw)
        if key in ("offer_ctc_lpa", "offered_gross_ctc", "offered_stvs", "hike_pct_offered"):
            parsed = _parse_ctc_lpa(raw)
            if parsed is not None:
                return parsed
            m = re.search(r"([\d.]+)", str(raw))
            if m:
                try:
                    return round(float(m.group(1)), 2)
                except ValueError:
                    return None
            return None
        if key == "notice_period_days":
            return _parse_notice_days(raw)
        return _str_val(raw)
    if isinstance(raw, (datetime, pd.Timestamp)):
        return raw.isoformat() if hasattr(raw, "isoformat") else str(raw)
    return _str_val(raw, 4000) if key == "remarks" else _str_val(raw)


def _find_excel_candidate_id_column(headers: List[str]) -> Optional[str]:
    for h in headers:
        nh = _norm_header(str(h))
        if nh in ("cand. id", "cand id", "candidate id"):
            return str(h)
    return None


def _find_excel_req_id_column(headers: List[str]) -> Optional[str]:
    for h in headers:
        nh = _norm_header(str(h))
        if nh in ("req. id", "req id", "req. id (ref.)", "req id (ref.)"):
            return str(h)
    return None


def _find_excel_name_column(headers: List[str]) -> Optional[str]:
    for h in headers:
        nh = _norm_header(str(h))
        if nh in ("candidate name", "candidate full name", "full name", "name"):
            return str(h)
    return None


def _norm_name(val: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (val or "").strip().lower())


def _lookup_candidate(
    *,
    project_id: int,
    excel_cid: Optional[str],
    req_id: Optional[str],
    full_name: Optional[str],
    by_excel_id: Dict[str, Candidate],
    by_req_name: Dict[Tuple[str, str], Candidate],
    all_candidates: List[Candidate],
) -> Optional[Candidate]:
    if excel_cid:
        hit = by_excel_id.get(excel_cid.strip().upper())
        if hit is not None:
            return hit
    if req_id and full_name:
        hit = by_req_name.get((req_id.strip().upper(), _norm_name(full_name)))
        if hit is not None:
            return hit
    if full_name:
        nn = _norm_name(full_name)
        matches = [c for c in all_candidates if _norm_name(c.full_name) == nn]
        if len(matches) == 1:
            return matches[0]
    return None


def _index_candidates(
    db: Session,
    project_id: int,
    records_by_id: Dict[int, Record],
) -> Tuple[Dict[str, Candidate], Dict[Tuple[str, str], Candidate], List[Candidate]]:
    rows = db.query(Candidate).filter(Candidate.project_id == project_id).all()
    by_excel_id: Dict[str, Candidate] = {}
    by_req_name: Dict[Tuple[str, str], Candidate] = {}
    for c in rows:
        eid = excel_candidate_id_from_row(c)
        if eid:
            by_excel_id[eid.strip().upper()] = c
        rec = records_by_id.get(c.record_id)
        req = (rec.client_req_id or "").strip().upper() if rec else ""
        if req and c.full_name:
            by_req_name[(req, _norm_name(c.full_name))] = c
    return by_excel_id, by_req_name, rows


def _merge_fill_null_only(
    cand: Candidate,
    mapped_values: List[Tuple[str, str, Any]],
) -> Dict[str, int]:
    """Apply gap-fill; returns counts per target key filled."""
    filled: Dict[str, int] = {}
    ooe = dict(cand.offer_onboarding_extras) if isinstance(cand.offer_onboarding_extras, dict) else {}
    ce = cand.candidate_extras if isinstance(cand.candidate_extras, dict) else {}

    for kind, key, val in mapped_values:
        if val is None or (isinstance(val, str) and not val.strip()):
            continue
        if kind == "column":
            existing = getattr(cand, key, None)
            if not _is_empty_db_value(existing):
                continue
            if _candidate_extras_has_semantic(ce, key):
                continue
            setattr(cand, key, val)
            filled[key] = filled.get(key, 0) + 1
        else:
            if not _is_empty_db_value(ooe.get(key)) or _extras_has_value(ce, key):
                continue
            ooe[key] = val
            filled[key] = filled.get(key, 0) + 1

    if filled:
        cand.offer_onboarding_extras = ooe
    return filled


def ingest_offer_onboarding_pass(
    file_path: str,
    db: Session,
    *,
    project_id: int,
    dry_run: bool = False,
) -> Dict[str, Any]:
    logs: List[str] = []
    stats = {
        "matched": 0,
        "patched": 0,
        "skipped_no_match": 0,
        "skipped_empty_row": 0,
        "skipped_no_new_fields": 0,
        "fields_filled": {},
        "warnings": [],
    }

    if not file_path or not __import__("os").path.isfile(file_path):
        return {"ok": False, "skipped": True, "reason": "file_not_found", "logs": logs, **stats}

    xl = pd.ExcelFile(file_path)
    sheet = detect_offer_onboarding_sheet(xl.sheet_names)
    if not sheet:
        logs.append("Pass 3: no Offer & Onboarding sheet — skipped")
        return {"ok": True, "skipped": True, "reason": "no_sheet", "logs": logs, **stats}

    logs.append(f"Pass 3: Offer & Onboarding sheet «{sheet}»")

    df = pd.read_excel(file_path, sheet_name=sheet, header=OFFER_HEADER_ROW, dtype=object)
    headers = [str(c) for c in df.columns.tolist()]
    header_map = _build_header_map(headers)
    logs.append(f"Pass 3: mapped {len(header_map)} offer/onboarding columns")

    cid_col = _find_excel_candidate_id_column(headers)
    req_col = _find_excel_req_id_column(headers)
    name_col = _find_excel_name_column(headers)

    records = db.query(Record).filter(Record.project_id == project_id).all()
    records_by_id = {r.id: r for r in records}
    by_excel_id, by_req_name, all_candidates = _index_candidates(db, project_id, records_by_id)

    for r_idx, row in df.iterrows():
        row_dict = {str(k): row[k] for k in df.columns}
        excel_cid = _str_val(_cell(row_dict, cid_col), 64) if cid_col else None
        req_id = _str_val(_cell(row_dict, req_col), 64) if req_col else None
        if req_id and req_id.endswith(".0"):
            req_id = req_id[:-2]
        full_name = _str_val(_cell(row_dict, name_col)) if name_col else None

        if not excel_cid and not full_name:
            stats["skipped_empty_row"] += 1
            continue

        cand = _lookup_candidate(
            project_id=project_id,
            excel_cid=excel_cid,
            req_id=req_id,
            full_name=full_name,
            by_excel_id=by_excel_id,
            by_req_name=by_req_name,
            all_candidates=all_candidates,
        )
        if cand is None:
            stats["skipped_no_match"] += 1
            label = excel_cid or full_name or "?"
            if len(stats["warnings"]) < 25:
                stats["warnings"].append(f"Row {int(r_idx) + OFFER_HEADER_ROW + 2}: no candidate match for {label}")
            continue

        stats["matched"] += 1
        mapped_values: List[Tuple[str, str, Any]] = []
        for excel_header, (kind, key, _frag) in header_map.items():
            raw = _cell(row_dict, excel_header)
            if _is_na(raw):
                continue
            val = _coerce_value(kind, key, raw)
            if val is None:
                continue
            mapped_values.append((kind, key, val))

        filled = _merge_fill_null_only(cand, mapped_values)
        if filled:
            stats["patched"] += 1
            for k, n in filled.items():
                stats["fields_filled"][k] = stats["fields_filled"].get(k, 0) + n
        else:
            stats["skipped_no_new_fields"] += 1

    if dry_run:
        logs.append("Pass 3: dry run — changes pending parent rollback/commit")
    else:
        logs.append(
            f"Pass 3: matched {stats['matched']}, patched {stats['patched']}, "
            f"no match {stats['skipped_no_match']}, no new fields {stats['skipped_no_new_fields']}"
        )

    ok = stats["patched"] > 0 or stats["matched"] > 0 or stats["skipped_no_match"] == 0
    return {
        "ok": ok,
        "skipped": False,
        "sheet": sheet,
        "header_map": {k: v[1] for k, v in header_map.items()},
        "logs": logs,
        **stats,
    }
