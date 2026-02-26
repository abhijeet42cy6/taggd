import pandas as pd
from sqlalchemy.orm import Session
from ..db.database import Project, Record
import datetime
import json
import math


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


class ExcelProcessor:
    def __init__(self, db: Session):
        self.db = db

    def process_file_into_db(self, project_id: int, filepath: str, sheet_name: str, mapping: dict, logic_func):
        """
        Reads the excel, applies mapping to universal keys,
        stores everything else in JSON, and runs the generated logic.
        """
        df = pd.read_excel(filepath, sheet_name=sheet_name)

        for _, row in df.iterrows():
            row_dict = row.to_dict()

            # --- 1. Map to Universal Keys ---
            universal_data = {}
            for u_key, excel_header in mapping.items():
                val = row_dict.get(excel_header)

                # Safe NaN / NaT / filler detection
                if _is_na(val) or str(val).strip().lower() in ['nan', 'nat', '-', '']:
                    val = None

                if isinstance(val, pd.Timestamp):
                    val = val.to_pydatetime()

                universal_data[u_key] = val

            # --- 2. Robust Skip Logic ---
            # Skip only if both name AND position are completely absent
            name = str(universal_data.get("candidate_name") or "").strip()
            title = str(universal_data.get("position_title") or "").strip()

            is_name_empty = not name or name.lower() in ['-', '.', 'nan', 'unknown', 'none', '']
            is_title_empty = not title or title.lower() in ['-', '.', 'nan', 'unknown', 'none', '']

            if is_name_empty and is_title_empty:
                continue

            # --- 3. Collect remaining columns into additional_attributes ---
            mapped_headers = set(mapping.values())
            additional_attr = {
                k: _sanitize_value(v)
                for k, v in row_dict.items()
                if k not in mapped_headers
            }

            # --- 4. Apply Generated Revenue Logic ---
            try:
                calc_results = logic_func(row_dict)
                # Sanitize any floats the logic might produce (inf / nan)
                if isinstance(calc_results, dict):
                    calc_results = {k: _sanitize_value(v) for k, v in calc_results.items()}
            except Exception as e:
                calc_results = {"revenue": 0, "status": f"Error: {str(e)}", "opening_fee": 0, "closing_fee": 0}

            # --- 5. Create Record ---
            new_record = Record(
                project_id=project_id,
                candidate_name=name or "Unknown",
                position_title=str(universal_data.get("position_title") or ""),
                status=str(universal_data.get("status") or ""),
                hiring_manager=str(universal_data.get("hiring_manager") or ""),
                offered_ctc=_safe_float(universal_data.get("offered_ctc")),
                joining_date=universal_data.get("joining_date") if isinstance(
                    universal_data.get("joining_date"), datetime.datetime
                ) else None,
                location=str(universal_data.get("location") or ""),
                department=str(universal_data.get("department") or ""),
                additional_attributes=additional_attr,
                revenue_results=calc_results,
            )
            self.db.add(new_record)

        # Batch commit
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            print(f"❌ Batch commit failed: {e}")
