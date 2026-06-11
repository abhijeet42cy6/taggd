import pandas as pd
from sqlalchemy.orm import Session
from ..db.database import Project, Record
from .column_mapping_normalize import all_mapped_excel_headers, get_status_lexicon_from_mapping, split_column_mapping
from typing import Optional

from .pos_id_column import normalize_pos_id_value
from .status_lexicon import get_status_lexicon, merge_global_status_with_revenue, resolve_row_status
from .record_field_synonyms import INGESTABLE_RECORD_COLUMNS, field_coercion_kind
import datetime
import json
import math
import hashlib

# Add standard library logging
import logging
logger = logging.getLogger(__name__)


def _is_na(val) -> bool:
    """Safe NaN/NaT check that never raises, even for complex types."""
    if val is None:
        return True
    try:
        result = pd.isna(val)
        # pd.isna on a scalar returns a bool; on a collection it returns array-like
        if isinstance(result, bool):
            return result
        return False  # collection — not considered NA
    except Exception:
        return False


def _safe_float(val) -> float:
    """Convert a value to a JSON-safe float (no inf, no nan)."""
    if val is None or _is_na(val):
        return 0.0
    try:
        f = float(str(val).replace(",", ""))
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f
    except Exception:
        return 0.0


def _normalize_offered_ctc(val) -> Optional[float]:
    """Annual CTC in absolute INR; fix spreadsheets stored with an extra ×1e5."""
    if val is None or _is_na(val):
        return None
    f = _safe_float(val)
    if f <= 0:
        return None
    if f >= 100_000_000_000:
        f /= 100_000.0
    return f


def _clean_candidate_name(val) -> str:
    s = str(val or "").strip()
    if _is_na(val) or s.lower() in ("unknown", "nan", "none", "nat", ""):
        return ""
    return s


def _safe_date(val):
    """Robustly parse strings and objects into datetime or None."""
    if _is_na(val) or str(val).strip().lower() in ['nan', 'nat', '-', '', 'none']:
        return None
    
    # 1. If it's already a date object
    if isinstance(val, (datetime.datetime, datetime.date)):
        if isinstance(val, pd.Timestamp):
            return val.to_pydatetime()
        return val
        
    # 2. If it's a string, try parsing it
    try:
        dt = pd.to_datetime(str(val), errors='coerce')
        if _is_na(dt):
            return None
        return dt.to_pydatetime()
    except Exception:
        return None


def _sanitize_value(v):
    """Recursively make a value safe to store in SQLite JSON."""
    if _is_na(v):
        return None
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if isinstance(v, (pd.Timestamp, datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _sanitize_value(vv) for k, vv in v.items()}
    if isinstance(v, (list, tuple)):
        return [_sanitize_value(item) for item in v]
    return v


def _safe_optional_int(val):
    if val is None or _is_na(val):
        return None
    s = str(val).strip().lower()
    if s in ("", "-", "nan", "none", "nat"):
        return None
    try:
        return int(float(str(val).replace(",", "")))
    except Exception:
        return None


def _safe_optional_float(val):
    if val is None or _is_na(val):
        return None
    s = str(val).strip().lower()
    if s in ("", "-", "nan", "none", "nat"):
        return None
    try:
        f = float(str(val).replace(",", ""))
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except Exception:
        return None


def _apply_record_field_columns(record: Record, row_dict: dict, record_fields: dict) -> None:
    """Set RPO / requisition columns from mapped Excel headers; skip empty cells."""
    for field, header in record_fields.items():
        if field not in INGESTABLE_RECORD_COLUMNS or not header:
            continue
        raw = row_dict.get(header)
        if raw is None or _is_na(raw):
            continue
        if isinstance(raw, str) and not str(raw).strip():
            continue
        kind = field_coercion_kind(field)
        if kind == "date":
            setattr(record, field, _safe_date(raw))
        elif kind == "int":
            v = _safe_optional_int(raw)
            if v is not None:
                setattr(record, field, v)
        elif kind == "float":
            v = _safe_optional_float(raw)
            if v is not None:
                setattr(record, field, v)
        else:
            s = str(raw).strip() if raw is not None else ""
            setattr(record, field, s or None)


def _additional_attributes(row_dict: dict, mapped_headers: frozenset) -> dict:
    return {
        k: _sanitize_value(v)
        for k, v in row_dict.items()
        if k not in mapped_headers
    }


def _derive_global_status(results: dict) -> str:
    """
    Decodes the financial signals from the logic generator into a 1:1 sync with central monitoring.
    Rules:
    - closing_fee > 0 -> CLOSED
    - opening_fee > 0 and closing_fee == 0 -> ACTIVE
    - revenue == 0 + common keyword in status msg -> PIPELINE or ON HOLD
    """
    if not isinstance(results, dict):
        return "UNPROCESSED"
        
    closing = float(results.get('closing_fee') or 0)
    opening = float(results.get('opening_fee') or 0)
    rev = float(results.get('revenue') or 0)
    status_msg = str(results.get('status') or "").lower()

    # 0. VOID / Ineligible Check (Negative Confirmation)
    if "no logic match" in status_msg or "ineligible" in status_msg or "not matched" in status_msg:
        return "VOID"

    # 1. Successful Hire (Closing Fee realized)
    if closing > 0:
        return "CLOSED"
        
    # 2. Position is active/open but not yet closed (Opening Fee realized)
    if opening > 0:
        return "ACTIVE"
        
    # 3. No revenue yet - check status message for pipeline vs hold
    if "offer" in status_msg or "interview" in status_msg or "sourcing" in status_msg or "in progress" in status_msg:
        return "PIPELINE"
        
    if "hold" in status_msg or "cancel" in status_msg or "void" in status_msg:
        return "ON HOLD"
        
    # 4. Fallback if revenue > 0 but buckets were empty (flat fee logic)
    if rev > 0 or "joined" in status_msg or "hired" in status_msg:
        return "CLOSED"
        
    return "UNPROCESSED"


class ExcelProcessor:
    def __init__(self, db: Session):
        self.db = db

    def _generate_fingerprint(self, project_id, name, pos_id, title, ctc, location, date_val):
        """Creates a unique multi-anchor hash to identify this specific record semantically."""
        # Normalize fields for stable hashing
        name_str = str(name or "_NA_").strip().lower()
        id_str = str(pos_id or "_NA_").strip().lower()
        title_str = str(title or "_NA_").strip().lower()
        ctc_str = str(ctc or "0.0").strip()
        loc_str = str(location or "_NA_").strip().lower()
        date_str = date_val.isoformat() if date_val and hasattr(date_val, 'isoformat') else "_NA_"
        
        # We exclude row_index to support sorting - Identity is now based on semantic data
        # PID|NAME|ID|TITLE|CTC|LOC|DATE
        raw_key = f"PID:{project_id}|NAME:{name_str}|ID:{id_str}|TITLE:{title_str}|CTC:{ctc_str}|LOC:{loc_str}|DATE:{date_str}"
        return hashlib.sha256(raw_key.encode()).hexdigest()

    def process_file_into_db(self, project_id: int, filepath: str, sheet_name, mapping: dict, logic_func):
        """
        Intelligent Delta-Sync: Updates existing records or inserts new ones based on multi-anchor fingerprint.
        """
        if isinstance(sheet_name, str):
            target_sheets = [sheet_name]
        else:
            target_sheets = sheet_name

        # --- 1. Map Existing State into Memory for Fast Comparison ---
        existing_records = self.db.query(Record).filter(Record.project_id == project_id).all()
        state_map = {r.fingerprint: r for r in existing_records if r.fingerprint}
        processed_fingerprints = set()

        # Get project specific ID column name for fingerprinting
        project_ref = self.db.query(Project).filter(Project.id == project_id).first()
        pos_id_col_name = project_ref.pos_id_column if project_ref else None

        universal_map, record_fields_map = split_column_mapping(mapping)
        status_lexicon = get_status_lexicon(mapping) or get_status_lexicon_from_mapping(mapping)
        # Per-sheet mapped headers: universal + record_fields apply to all sheets; unmapped columns vary by sheet
        base_mapped = all_mapped_excel_headers(universal_map, record_fields_map)

        for s_idx, s_name in enumerate(target_sheets):
            print(f"⌛ Analyzing Delta for sheet: {s_name}...")
            try:
                df = pd.read_excel(filepath, sheet_name=s_name)
            except Exception as e:
                print(f"❌ Error reading sheet {s_name}: {e}")
                continue

            for r_idx, row in df.iterrows():
                row_dict = row.to_dict()
                excel_pos = r_idx + 1 # 1-indexed for clarity

                # --- 1. Map to Universal Keys ---
                universal_data = {}
                for u_key, excel_header in universal_map.items():
                    val = row_dict.get(excel_header)
                    universal_data[u_key] = val

                # Date normalization
                universal_data["joining_date"] = _safe_date(universal_data.get("joining_date"))
                universal_data["creation_date"] = _safe_date(universal_data.get("creation_date"))

                # --- 2. Robust Sieve (Skip logic) ---
                row_text = str(list(row_dict.values())).lower()
                if any(k in row_text for k in ['total', 'grand total', 'subtotal', 'sum of', 'balance']):
                    continue
                non_empty_count = sum(1 for v in row_dict.values() if not _is_na(v) and str(v).strip() != "")
                if non_empty_count < (len(row_dict) * 0.15):
                    continue

                name = _clean_candidate_name(universal_data.get("candidate_name"))
                title = str(universal_data.get("position_title") or "").strip()
                if _is_na(universal_data.get("position_title")):
                    title = ""
                
                # Check for Pos ID value for the specific anchor
                pos_id_val = (
                    normalize_pos_id_value(row_dict.get(pos_id_col_name))
                    if pos_id_col_name
                    else ""
                )

                # Skip genuinely empty rows
                if not name and not title and not pos_id_val:
                    continue

                # --- 3. Fingerprinting (Multi-Anchor Identification) ---
                current_fingerprint = self._generate_fingerprint(
                    project_id, 
                    name, 
                    pos_id_val, 
                    title, 
                    universal_data.get("offered_ctc"), 
                    universal_data.get("location"), 
                    universal_data.get("creation_date")
                )
                
                # If we've already seen this exact row in THIS file, skip it (spreadsheet deduplication)
                if current_fingerprint in processed_fingerprints:
                    continue
                processed_fingerprints.add(current_fingerprint)

                # --- 4. Apply Calculation Logic ---
                try:
                    calc_results = logic_func(row_dict)
                    if isinstance(calc_results, dict):
                        # Unit Normalization: Auto-correct Lacs to absolute INR
                        # If a key like 'revenue' or 'fee' has a value < 1000 and > 0, we treat it as Lacs
                        money_keys = {'revenue', 'opening_fee', 'closing_fee', 'margin', 'cost'}
                        for k, v in calc_results.items():
                            if k.lower() in money_keys and isinstance(v, (int, float)):
                                if 0 < v < 1000:
                                    calc_results[k] = v * 100000
                        
                        calc_results = {k: _sanitize_value(v) for k, v in calc_results.items()}
                except Exception as e:
                    calc_results = {"revenue": 0, "status": f"Calc Error: {str(e)}", "opening_fee": 0, "closing_fee": 0}

                g_status = _derive_global_status(calc_results)
                if g_status == "VOID":
                    g_status = "UNPROCESSED"

                row_status_raw: Optional[str] = None
                row_canonical_status = str(universal_data.get("status") or "")
                if status_lexicon:
                    row_status_raw, row_canonical_status, lex_global = resolve_row_status(
                        row_dict,
                        status_lexicon,
                        candidate_name=name,
                    )
                    g_status = merge_global_status_with_revenue(lex_global, calc_results)

                # Identity Coalescing — only synthesize REQ:// when we have a real req id
                final_name = name
                if not final_name and pos_id_val:
                    final_name = f"REQ://{pos_id_val}"

                # --- 5. Delta Phase: Match with Database ---
                existing_record = state_map.get(current_fingerprint)
                
                if existing_record:
                    # UPDATING existing record ONLY if something has changed
                    # (Candidate Name, Status, or logic results might have evolved)
                    existing_record.candidate_name = final_name or "Unknown"
                    existing_record.position_title = title
                    existing_record.status = row_canonical_status
                    existing_record.hiring_manager = str(universal_data.get("hiring_manager") or "").strip() or None
                    existing_record.offered_ctc = _normalize_offered_ctc(universal_data.get("offered_ctc"))
                    existing_record.creation_date = universal_data.get("creation_date")
                    existing_record.location = str(universal_data.get("location") or "").strip() or None
                    existing_record.department = str(universal_data.get("department") or "").strip() or None
                    existing_record.global_status = g_status
                    existing_record.revenue_results = calc_results
                    existing_record.joining_date = universal_data.get("joining_date")
                    existing_record.excel_row_index = excel_pos # Update position if shifted
                    existing_record.excel_provided_id = pos_id_val # Update if ID column metadata changed
                    _apply_record_field_columns(existing_record, row_dict, record_fields_map)
                    attrs = _additional_attributes(row_dict, base_mapped)
                    if row_status_raw is not None:
                        attrs = dict(attrs)
                        attrs["status_raw_excel"] = row_status_raw
                    existing_record.additional_attributes = attrs
                else:
                    # NEW Record creation
                    new_record = Record(
                        project_id=project_id,
                        candidate_name=final_name or "Unknown",
                        position_title=title,
                        status=row_canonical_status,
                        hiring_manager=(str(universal_data.get("hiring_manager") or "").strip() or None),
                        offered_ctc=_normalize_offered_ctc(universal_data.get("offered_ctc")),
                        joining_date=universal_data.get("joining_date"),
                        creation_date=universal_data.get("creation_date"),
                        location=str(universal_data.get("location") or "").strip() or None,
                        department=str(universal_data.get("department") or "").strip() or None,
                        additional_attributes=_additional_attributes(row_dict, base_mapped),
                        revenue_results=calc_results,
                        global_status=g_status,
                        fingerprint=current_fingerprint,
                        excel_row_index=excel_pos,
                        excel_provided_id=pos_id_val,
                    )
                    _apply_record_field_columns(new_record, row_dict, record_fields_map)
                    if row_status_raw is not None:
                        attrs = dict(new_record.additional_attributes or {})
                        attrs["status_raw_excel"] = row_status_raw
                        new_record.additional_attributes = attrs
                    self.db.add(new_record)

        # Batch commit all additions and updates
        try:
            self.db.commit()
            print(f"✅ Delta Sync Complete: Synchronized {len(processed_fingerprints)} records.")
        except Exception as e:
            self.db.rollback()
            print(f"❌ Batch sync failed: {e}")
