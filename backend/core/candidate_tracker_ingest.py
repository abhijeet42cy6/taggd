"""Autonomous candidate tracker workbook ingest → `candidates` + mandate stubs + master links."""

from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from backend.core.candidate_field_synonyms import (
    heuristic_candidate_field_map,
    mapped_headers_set,
)
from backend.core.candidate_master_mgmt import ensure_master_link_for_candidate, normalize_email, normalize_phone
from backend.core.requisition_matcher import (
    MandateSignals,
    extract_mandate_signals,
    find_best_requisition_match,
    mandate_signature,
)
from backend.db.database import Candidate, Project, Record, User

logger = logging.getLogger(__name__)

CANDIDATE_SHEET_KEYWORDS = ("candidate", "tracker", "pipeline", "placement")
SUMMARY_KEYWORDS = ("total", "grand total", "subtotal", "sum of", "balance")


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").strip().lower()).replace("\xa0", " ")


def header_fingerprint(headers: List[str]) -> str:
    norm = sorted({_norm_header(h) for h in headers if h and str(h).strip()})
    raw = "|".join(norm).encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()[:24]


def detect_candidate_sheet(sheet_names: List[str]) -> str:
    for name in sheet_names:
        nl = _norm_header(name)
        if "candidate" in nl and "tracker" in nl:
            return name
    for name in sheet_names:
        nl = _norm_header(name)
        if any(k in nl for k in CANDIDATE_SHEET_KEYWORDS):
            return name
    return sheet_names[0] if sheet_names else "Sheet1"


def resolve_project_id(
    db: Session,
    *,
    filename: str,
    explicit_project_id: Optional[int] = None,
) -> Optional[int]:
    if explicit_project_id is not None:
        if db.query(Project.id).filter(Project.id == explicit_project_id).first():
            return explicit_project_id
        return None

    stem = os.path.splitext(os.path.basename(filename or ""))[0].lower()
    stem = re.sub(r"\(.*?\)", "", stem)
    stem = re.sub(r"position tracker.*", "", stem)
    stem = re.sub(r"[^a-z0-9]+", " ", stem).strip()
    if not stem:
        return None

    projects = db.query(Project).all()
    best_id: Optional[int] = None
    best_score = 0
    for p in projects:
        for label in (p.account_name or "", p.engagement_name or "", p.filename or ""):
            ll = (label or "").lower()
            if not ll:
                continue
            if stem in ll or ll in stem:
                score = len(ll)
                if score > best_score:
                    best_score = score
                    best_id = p.id
            # token overlap
            tokens = set(stem.split())
            ltokens = set(re.sub(r"[^a-z0-9]+", " ", ll).split())
            overlap = len(tokens & ltokens)
            if overlap >= 1 and overlap > best_score:
                best_score = overlap
                best_id = p.id
    return best_id


def _is_na(val: Any) -> bool:
    if val is None:
        return True
    try:
        r = pd.isna(val)
        return bool(r) if isinstance(r, bool) else False
    except Exception:
        return False


def _safe_date(val: Any) -> Optional[datetime]:
    if _is_na(val) or str(val).strip().lower() in ("", "-", "nan", "nat", "none", "n/a", "na"):
        return None
    if isinstance(val, datetime):
        return val
    try:
        dt = pd.to_datetime(str(val), errors="coerce")
        if _is_na(dt):
            return None
        return dt.to_pydatetime()
    except Exception:
        return None


def _parse_experience_yrs(val: Any) -> Optional[float]:
    if _is_na(val):
        return None
    s = str(val).strip().lower()
    if s in ("", "-", "na", "n/a", "none"):
        return None
    m = re.search(r"([\d.]+)", s)
    if m:
        try:
            return round(float(m.group(1)), 2)
        except ValueError:
            return None
    try:
        return round(float(val), 2)
    except (TypeError, ValueError):
        return None


def _parse_ctc_lpa(val: Any) -> Optional[float]:
    if _is_na(val):
        return None
    s = str(val).strip().lower().replace(",", "")
    if s in ("", "-", "na", "n/a", "none"):
        return None
    s = re.sub(r"\s*lpa\s*", "", s)
    m = re.search(r"([\d.]+)", s)
    if not m:
        return None
    try:
        f = float(m.group(1))
        if f > 500:  # likely annual in thousands, not LPA
            return round(f / 100000.0, 2)
        return round(f, 2)
    except ValueError:
        return None


def _parse_notice_days(val: Any) -> Optional[int]:
    if _is_na(val):
        return None
    if isinstance(val, datetime):
        return None
    s = str(val).strip().lower()
    if s in ("", "-", "na", "n/a"):
        return None
    if "immediate" in s:
        return 0
    m = re.search(r"(\d+)", s)
    if m:
        return int(m.group(1))
    return None


def _sanitize_extras(row_dict: dict, mapped: frozenset[str]) -> dict:
    out = {}
    for k, v in row_dict.items():
        if k in mapped:
            continue
        if _is_na(v):
            continue
        if isinstance(v, (datetime, pd.Timestamp)):
            out[str(k)] = v.isoformat() if hasattr(v, "isoformat") else str(v)
        elif isinstance(v, float) and (pd.isna(v)):
            continue
        else:
            out[str(k)] = v if isinstance(v, (str, int, float, bool)) else str(v)
    return out


def _cell(row: dict, header: Optional[str]) -> Any:
    if not header:
        return None
    return row.get(header)


def _str_val(val: Any, max_len: int = 512) -> Optional[str]:
    if _is_na(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in ("-", "na", "n/a", "none"):
        return None
    return s[:max_len]


def _extract_excel_candidate_id(row_dict: dict) -> Optional[str]:
    for k, v in row_dict.items():
        nh = _norm_header(str(k))
        if nh in ("cand. id", "cand id", "candidate id"):
            cid = _str_val(v, 64)
            if cid and cid.endswith(".0"):
                cid = cid[:-2]
            return cid
    return None


def _make_client_candidate_id(
    project_id: int,
    email: Optional[str],
    phone: Optional[str],
    name: Optional[str],
    req_id: Optional[str],
) -> str:
    parts = [
        str(project_id),
        email or "",
        phone or "",
        (name or "").strip().lower()[:80],
        (req_id or "").strip().lower()[:40],
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]


def _make_fingerprint(project_id: int, email: Optional[str], phone: Optional[str], name: Optional[str], req_id: Optional[str]) -> str:
    raw = f"PID:{project_id}|E:{email or '_'}|P:{phone or '_'}|N:{(name or '').lower()}|R:{req_id or '_'}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _resolve_user_id(db: Session, name: Optional[str]) -> Optional[int]:
    if not name or not str(name).strip():
        return None
    s = str(name).strip()
    if "@" in s:
        u = db.query(User).filter(User.email.ilike(s.lower())).first()
        return u.id if u else None
    first = s.split()[0].lower()
    rows = db.query(User).filter(User.is_active.is_(True)).all()
    for u in rows:
        gn = (u.given_name or "").strip().lower()
        fn = (u.family_name or "").strip().lower()
        email_local = (u.email or "").split("@")[0].lower()
        if first and (first == gn or first == email_local or first in fn):
            return u.id
    return None


def _find_or_create_record(
    db: Session,
    *,
    project_id: int,
    signals: MandateSignals,
    candidate_name: Optional[str],
    current_stage: Optional[str],
    hiring_manager: Optional[str],
    assigned_recruiter: Optional[str],
    row_dict: dict,
    project_records: List[Record],
) -> Tuple[Record, Optional[float], Optional[str]]:
    """
    Resolve mandate for a candidate row.

    Returns (record, match_score, match_method) where match_method is
    client_req_id | scored_match | signature_stub | new_stub.
    """
    q = db.query(Record).filter(Record.project_id == project_id)
    rec: Optional[Record] = None
    match_score: Optional[float] = None
    match_method: Optional[str] = None

    if signals.client_req_id:
        rec = q.filter(Record.client_req_id == str(signals.client_req_id).strip()).first()
        if rec is not None:
            return rec, 1.0, "client_req_id"
        # Req id present but unknown → new mandate; do NOT fall back to position title.
    else:
        rec, match_score, _parts = find_best_requisition_match(
            db, project_id, signals, project_records=project_records
        )
        if rec is not None:
            return rec, match_score, "scored_match"

    sig = mandate_signature(signals)
    title = signals.position_title or "Open mandate"
    name = candidate_name or "—"
    fp_raw = f"STUB|{project_id}|{signals.client_req_id or ''}|{sig}"
    stub_fp = hashlib.sha256(fp_raw.encode()).hexdigest()

    rec = Record(
        project_id=project_id,
        candidate_name=name,
        position_title=title,
        status=current_stage or "PIPELINE",
        hiring_manager=hiring_manager or (str(signals.hiring_manager) if signals.hiring_manager else None),
        assigned_recruiter_rpo=assigned_recruiter or (str(signals.assigned_recruiter) if signals.assigned_recruiter else None),
        location=signals.location,
        department=signals.department,
        rpo_division=signals.division,
        client_req_id=str(signals.client_req_id).strip() if signals.client_req_id else None,
        fingerprint=stub_fp,
        additional_attributes={
            "source": "candidate_tracker_stub",
            "mandate_signature": sig,
            "raw_row_sample": {k: str(v)[:120] for k, v in list(row_dict.items())[:8]},
        },
    )
    db.add(rec)
    db.flush()
    project_records.append(rec)
    method = "new_stub" if signals.client_req_id else "signature_stub"
    return rec, None, method


def _load_or_build_header_map(
    project: Project,
    headers: List[str],
    *,
    use_llm: bool,
) -> Dict[str, str]:
    fp = header_fingerprint(headers)
    cm = project.column_mapping if isinstance(project.column_mapping, dict) else {}
    cached = cm.get("candidate_tracker_spec") if isinstance(cm, dict) else None
    if isinstance(cached, dict) and cached.get("header_fingerprint") == fp:
        hm = cached.get("header_map")
        if isinstance(hm, dict) and hm:
            return {str(k): str(v) for k, v in hm.items()}

    header_map = heuristic_candidate_field_map(headers)

    if use_llm and os.getenv("GEMINI_API_KEY"):
        try:
            from backend.agents.candidate_column_mapper import CandidateColumnMapperAgent

            agent = CandidateColumnMapperAgent()
            sample_df = pd.DataFrame(columns=headers)
            llm_map = agent.map_headers(headers, [])
            for k, v in (llm_map or {}).items():
                if k in header_map or not v:
                    continue
                if v in headers:
                    header_map[k] = v
        except Exception as e:
            logger.warning("Candidate LLM mapper skipped: %s", e)

    spec = {
        "header_fingerprint": fp,
        "header_map": header_map,
        "updated_at": datetime.utcnow().isoformat(),
    }
    new_cm = dict(cm) if isinstance(cm, dict) else {}
    new_cm["candidate_tracker_spec"] = spec
    project.column_mapping = new_cm
    return header_map


def _row_is_skippable(row_dict: dict, header_map: Dict[str, str]) -> bool:
    row_text = str(list(row_dict.values())).lower()
    if any(k in row_text for k in SUMMARY_KEYWORDS):
        return True
    non_empty = sum(1 for v in row_dict.values() if not _is_na(v) and str(v).strip() != "")
    if non_empty < max(3, int(len(row_dict) * 0.08)):
        return True
    name_h = header_map.get("full_name")
    email_h = header_map.get("email_id")
    name = _str_val(_cell(row_dict, name_h))
    email = _str_val(_cell(row_dict, email_h))
    if not name and not email:
        return True
    return False


def ingest_candidate_tracker(
    file_path: str,
    db: Session,
    *,
    project_id: Optional[int] = None,
    use_llm: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Parse candidate tracker workbook and upsert into `candidates`."""
    logs: List[str] = []
    if not os.path.isfile(file_path):
        return {"ok": False, "error": f"File not found: {file_path}", "logs": logs}

    xl = pd.ExcelFile(file_path)
    sheet = detect_candidate_sheet(xl.sheet_names)
    logs.append(f"Target sheet: {sheet}")

    df = pd.read_excel(file_path, sheet_name=sheet, dtype=object)
    headers = [str(c) for c in df.columns.tolist()]

    resolved_pid = resolve_project_id(db, filename=file_path, explicit_project_id=project_id)
    if resolved_pid is None:
        return {
            "ok": False,
            "error": "Could not resolve project — select a project or name the file after the account.",
            "logs": logs,
        }

    project = db.query(Project).filter(Project.id == resolved_pid).first()
    if not project:
        return {"ok": False, "error": f"Project {resolved_pid} not found", "logs": logs}

    logs.append(f"Project: PRJ-{project.id} ({project.account_name or project.engagement_name or '—'})")

    header_map = _load_or_build_header_map(project, headers, use_llm=use_llm)
    logs.append(f"Mapped {len(header_map)} candidate fields (fingerprint {header_fingerprint(headers)})")
    mapped = mapped_headers_set(header_map)

    inserted = updated = skipped = stubs_created = masters_linked = errors = 0
    warnings: List[str] = []
    match_stats: Dict[str, int] = {
        "client_req_id": 0,
        "scored_match": 0,
        "signature_stub": 0,
        "new_stub": 0,
    }
    stub_ids_created: Set[int] = set()

    existing_by_cid: Dict[str, Candidate] = {}
    for c in db.query(Candidate).filter(Candidate.project_id == resolved_pid).all():
        existing_by_cid[c.client_candidate_id] = c

    project_records: List[Record] = db.query(Record).filter(Record.project_id == resolved_pid).all()

    for r_idx, row in df.iterrows():
        row_dict = {str(k): row[k] for k in df.columns}
        if _row_is_skippable(row_dict, header_map):
            skipped += 1
            continue

        try:
            with db.begin_nested():
                full_name = _str_val(_cell(row_dict, header_map.get("full_name")))
                email_raw = _str_val(_cell(row_dict, header_map.get("email_id")))
                email_n = normalize_email(email_raw)
                phone_raw = _cell(row_dict, header_map.get("contact_no"))
                phone_s = _str_val(phone_raw, 32)
                if phone_s and phone_s.endswith(".0"):
                    phone_s = phone_s[:-2]
                phone_n = normalize_phone(phone_s)

                req_raw = _cell(row_dict, header_map.get("client_req_id"))
                req_id = _str_val(req_raw, 64) if req_raw is not None else None
                if req_id and req_id.endswith(".0"):
                    req_id = req_id[:-2]

                position_title = _str_val(_cell(row_dict, header_map.get("position_title")))
                current_stage = _str_val(_cell(row_dict, header_map.get("current_stage")))
                hiring_manager = _str_val(_cell(row_dict, header_map.get("hiring_manager")))
                assigned_recruiter = _str_val(_cell(row_dict, header_map.get("assigned_recruiter")))
                sourcer = _str_val(_cell(row_dict, header_map.get("sourcer_name")))

                mandate_signals = extract_mandate_signals(row_dict, header_map)
                if position_title and not mandate_signals.position_title:
                    mandate_signals.position_title = position_title
                if req_id and not mandate_signals.client_req_id:
                    mandate_signals.client_req_id = req_id

                client_candidate_id = _make_client_candidate_id(resolved_pid, email_n, phone_n, full_name, req_id)
                fingerprint = _make_fingerprint(resolved_pid, email_n, phone_n, full_name, req_id)

                record, _match_score, match_method = _find_or_create_record(
                    db,
                    project_id=resolved_pid,
                    signals=mandate_signals,
                    candidate_name=full_name,
                    current_stage=current_stage,
                    hiring_manager=hiring_manager,
                    assigned_recruiter=assigned_recruiter,
                    row_dict=row_dict,
                    project_records=project_records,
                )
                if match_method:
                    match_stats[match_method] = match_stats.get(match_method, 0) + 1
                if match_method in ("signature_stub", "new_stub") and record.id not in stub_ids_created:
                    stub_ids_created.add(record.id)
                    stubs_created += 1

                extras = _sanitize_extras(row_dict, mapped)
                excel_cid = _extract_excel_candidate_id(row_dict)
                if excel_cid:
                    extras["excel_candidate_id"] = excel_cid
                if header_map.get("rpo_bu_sbu"):
                    bu = _str_val(_cell(row_dict, header_map["rpo_bu_sbu"]))
                    if bu:
                        extras["bu"] = bu
                if header_map.get("rpo_division"):
                    div = _str_val(_cell(row_dict, header_map["rpo_division"]))
                    if div:
                        extras["division"] = div

                payload: Dict[str, Any] = {
                    "full_name": full_name,
                    "email_id": email_raw,
                    "contact_no": phone_s,
                    "gender": _str_val(_cell(row_dict, header_map.get("gender")), 16),
                    "current_location": _str_val(_cell(row_dict, header_map.get("current_location"))),
                    "qualification": _str_val(_cell(row_dict, header_map.get("qualification"))),
                    "total_experience_yrs": _parse_experience_yrs(_cell(row_dict, header_map.get("total_experience_yrs"))),
                    "current_organization": _str_val(_cell(row_dict, header_map.get("current_organization"))),
                    "current_designation": _str_val(_cell(row_dict, header_map.get("current_designation"))),
                    "notice_period_days": _parse_notice_days(_cell(row_dict, header_map.get("notice_period_days"))),
                    "current_ctc_lpa": _parse_ctc_lpa(_cell(row_dict, header_map.get("current_ctc_lpa"))),
                    "expected_ctc_lpa": _parse_ctc_lpa(_cell(row_dict, header_map.get("expected_ctc_lpa"))),
                    "assigned_recruiter": assigned_recruiter,
                    "hiring_manager": hiring_manager,
                    "sourcer_name": sourcer,
                    "current_stage": current_stage,
                    "expected_doj": _safe_date(_cell(row_dict, header_map.get("expected_doj"))),
                    "actual_doj": _safe_date(_cell(row_dict, header_map.get("actual_doj"))),
                    "selection_date": _safe_date(_cell(row_dict, header_map.get("selection_date"))),
                    "offer_date": _safe_date(_cell(row_dict, header_map.get("offer_date"))),
                    "source_of_hire": _str_val(_cell(row_dict, header_map.get("source_of_hire"))),
                    "fingerprint": fingerprint,
                    "excel_row_index": int(r_idx) + 2,
                    "candidate_extras": extras,
                }

                hm_uid = _resolve_user_id(db, hiring_manager)
                rec_uid = _resolve_user_id(db, assigned_recruiter)
                if hm_uid:
                    payload["hiring_manager_user_id"] = hm_uid
                if rec_uid:
                    payload["assigned_recruiter_user_id"] = rec_uid

                existing = existing_by_cid.get(client_candidate_id)
                if existing:
                    for k, v in payload.items():
                        if v is not None:
                            setattr(existing, k, v)
                    existing.record_id = record.id
                    updated += 1
                    cand = existing
                else:
                    cand = Candidate(
                        project_id=resolved_pid,
                        record_id=record.id,
                        client_candidate_id=client_candidate_id,
                        **payload,
                    )
                    db.add(cand)
                    db.flush()
                    existing_by_cid[client_candidate_id] = cand
                    inserted += 1

                if not dry_run:
                    link = ensure_master_link_for_candidate(db, cand)
                    if link:
                        masters_linked += 1

        except Exception as e:
            errors += 1
            if len(warnings) < 20:
                warnings.append(f"Row {int(r_idx) + 2}: {e}")
            logger.exception("Candidate row ingest failed at %s", r_idx)

    from backend.core.offer_onboarding_tracker_ingest import ingest_offer_onboarding_pass

    offer_pass = ingest_offer_onboarding_pass(
        file_path,
        db,
        project_id=resolved_pid,
        dry_run=dry_run,
    )
    logs.extend(offer_pass.get("logs", []))
    for w in offer_pass.get("warnings") or []:
        if len(warnings) < 20:
            warnings.append(w)

    if dry_run:
        db.rollback()
        logs.append("Dry run — no changes committed")
    else:
        db.commit()
        logs.append("Committed to database")

    total = inserted + updated
    ok = total > 0 or (skipped > 0 and errors == 0)
    message = (
        f"Ingested {total} candidate rows ({inserted} new, {updated} updated); "
        f"{skipped} skipped; {stubs_created} mandate stubs; {masters_linked} master links."
    )
    if errors:
        message += f" {errors} row errors — see warnings."
        if total == 0:
            ok = False
    if offer_pass.get("patched"):
        message += f" Offer/onboarding pass patched {offer_pass['patched']} row(s)."
    elif offer_pass.get("skipped") and offer_pass.get("reason") == "no_sheet":
        message += " (No Offer & Onboarding sheet — pass 3 skipped.)"

    logs.append(
        f"Mandate linkage: req_id={match_stats.get('client_req_id', 0)}, "
        f"scored_match={match_stats.get('scored_match', 0)}, "
        f"signature_stub={match_stats.get('signature_stub', 0)}, "
        f"new_stub={match_stats.get('new_stub', 0)}"
    )

    return {
        "ok": ok,
        "message": message,
        "project_id": resolved_pid,
        "sheet": sheet,
        "header_map": header_map,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "stubs_created": stubs_created,
        "masters_linked": masters_linked,
        "errors": errors,
        "warnings": warnings,
        "match_stats": match_stats,
        "logs": logs,
        "dry_run": dry_run,
        "offer_onboarding_pass": offer_pass,
    }
