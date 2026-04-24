"""
Parse and ingest *Resume Supply Chain Partner* / *JOB BOARD* vendor license workbooks
into `resume_supplier_licenses`.

Expected: sheet *Job Board Tracker* (or name containing "Job Board"), header row with
*Job Board / Vendor*, data rows, optional *TOTAL / SUMMARY* / *GRAND TOTAL* rows skipped.
"""
from __future__ import annotations

import datetime
import re
import math
import os
from typing import Any, Optional

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.orm import Session

from backend.db.database import ResumeSupplierLicense

SHEET_CANDIDATES = ("Job Board Tracker", "job board tracker")
DASH = frozenset({"—", "–", "-", "—", "N/A", "n/a", "*", ""})


def _norm_header(cell: object) -> str:
    if cell is None:
        return ""
    s = " ".join(str(cell).replace("\n", " ").split()).strip().lower()
    return s


def _xlsx_path(path: str) -> str:
    return os.path.abspath(path)


def _find_tracker_sheet(wb: openpyxl.workbook.workbook.Workbook) -> str:
    names = {n: n for n in wb.sheetnames}
    for cand in SHEET_CANDIDATES:
        if cand in names:
            return cand
    for n in wb.sheetnames:
        nlow = n.lower()
        if "job board" in nlow and "tracker" in nlow:
            return n
    raise ValueError(
        f"No 'Job Board Tracker' sheet. Available: {wb.sheetnames!r}"
    )


def _extract_fiscal_year(ws: Worksheet) -> str:
    """Read FY label from top rows, e.g. 'FY 2025-26 | ...'."""
    for r in range(1, 5):
        for c in range(1, 6):
            v = ws.cell(r, c).value
            if v is None:
                continue
            t = str(v).strip()
            m = re.search(r"FY\s*(\d{4}-\d{2})\b", t, re.I)
            if m:
                return f"FY {m.group(1)}"
    return "FY 2025-26"


def _find_header_map(ws: Worksheet) -> tuple[int, dict[str, int]]:
    """Returns (header_row_1based, col_key -> 1-based column index)."""
    for r in range(1, 15):
        row_vals = [ws.cell(r, c).value for c in range(1, 25)]
        keys: dict[str, int] = {}
        for c, v in enumerate(row_vals, start=1):
            h = _norm_header(v)
            if h == "#" or h == "no" or h == "no.":
                keys["row_seq"] = c
            if "job board" in h and "vendor" in h:
                keys["vendor_name"] = c
            elif h == "login ids" or h.startswith("login id"):
                keys["login_ids_count"] = c
            elif "resume" in h and "invent" in h:
                keys["resume_inventory"] = c
            elif h == "job postings" or "job posting" in h:
                keys["job_postings"] = c
            elif "naukri" in h and "invite" in h:
                keys["naukri_invites"] = c
            elif h == "utilization" or h.startswith("utilis"):
                keys["utilization"] = c
            elif h == "start date" or h.startswith("start date"):
                keys["start_date"] = c
            elif h == "end date" or h.startswith("end date"):
                keys["end_date"] = c
            elif "contract" in h and "duration" in h:
                keys["contract_duration_months"] = c
            elif "cost" in h and "inr" in h:
                keys["cost_inr"] = c
            elif "primary" in h and "name" in h and "second" not in h:
                keys["primary_person_name"] = c
            elif "primary" in h and "contact" in h:
                keys["primary_person_phone"] = c
            elif "primary" in h and "email" in h:
                keys["primary_person_email"] = c
            elif "secondary" in h and "name" in h:
                keys["secondary_person_name"] = c
            elif "secondary" in h and "contact" in h:
                keys["secondary_person_phone"] = c
            elif "secondary" in h and "email" in h:
                keys["secondary_person_email"] = c
            elif h == "remarks" or h.startswith("remark"):
                keys["remarks"] = c
        if "vendor_name" in keys and "cost_inr" in keys:
            return r, keys
    raise ValueError("Could not find header row with 'Job Board / Vendor' and 'Cost'.")


def _is_skip_vendor(name: str) -> bool:
    u = (name or "").strip().upper()
    if not u:
        return True
    if "TOTAL" in u or u.startswith("GRAND"):
        return True
    if u in {"N/A", "—"}:
        return True
    return False


def _parse_date(val: object) -> Optional[datetime.date]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val
    s = str(val).strip()
    if not s or s in DASH:
        return None
    if len(s) >= 10 and re.match(r"^\d{4}-\d{2}-\d{2}$", s[:10]):
        try:
            return datetime.date.fromisoformat(s[:10])
        except ValueError:
            pass
    attempts: list[tuple[str, str]] = [
        (s[:9] if len(s) >= 9 else s, "%d-%b-%y"),
        (s[:11] if len(s) >= 11 else s, "%d-%B-%y"),
    ]
    if len(s) >= 10:
        attempts.append((s[:10], "%Y-%m-%d"))
    for chunk, fmt in attempts:
        try:
            return datetime.datetime.strptime(chunk, fmt).date()
        except ValueError:
            continue
    for fmt in ("%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_int_cell(val: object) -> Optional[int]:
    if val is None or val == "":
        return None
    if isinstance(val, bool):
        return int(val)
    if isinstance(val, (int,)):
        return int(val)
    if isinstance(val, float):
        if math.isnan(val):
            return None
        if val == int(val):
            return int(val)
    s = str(val).strip()
    if s in DASH:
        return None
    s = s.replace(",", "").replace("₹", "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _parse_float_cell(val: object) -> Optional[float]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        if isinstance(val, float) and math.isnan(val):
            return None
        return float(val)
    s = str(val).strip()
    if s in DASH:
        return None
    s = s.replace(",", "").replace("₹", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_resume_inventory(val: object) -> Optional[str]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if isinstance(val, float) and math.isnan(val):
            return None
        if val == int(val) and abs(int(val)) < 10**12:
            return f"{int(val):,}"
    s = str(val).strip()
    if not s or s in DASH:
        return None
    if s.lower() == "unlimited":
        return "Unlimited"
    if s.lower() in {"n/a", "n/a."}:
        return None
    return s


def _phone_str(val: object) -> Optional[str]:
    if val is None or val == "":
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, float):
        if math.isnan(val):
            return None
        if val == int(val):
            return str(int(val))
        s = str(val).strip()
        return s if s and s not in DASH else None
    if isinstance(val, int):
        return str(val)
    s = str(val).strip()
    if s in DASH:
        return None
    return s if s else None


def _get_cell(ws: Worksheet, r: int, col_map: dict[str, int], key: str) -> Any:
    c = col_map.get(key)
    if not c:
        return None
    return ws.cell(r, c).value


def parse_workbook(path: str) -> dict[str, Any]:
    """Load xlsx; return {fiscal_year_label, rows: list[dict]}. No DB access."""
    path = _xlsx_path(path)
    wb = openpyxl.load_workbook(path, data_only=True)
    sheet_name = _find_tracker_sheet(wb)
    ws = wb[sheet_name]
    fy = _extract_fiscal_year(ws)
    header_row, col_map = _find_header_map(ws)
    out_rows: list[dict[str, Any]] = []
    for r in range(header_row + 1, min(ws.max_row, header_row + 200) + 1):
        if "row_seq" in col_map:
            sid = _parse_int_cell(_get_cell(ws, r, col_map, "row_seq"))
            if sid is None or sid < 1 or sid > 20_000:
                continue
        vname = _get_cell(ws, r, col_map, "vendor_name")
        name_s = str(vname).strip() if vname is not None else ""
        if _is_skip_vendor(name_s):
            continue
        rec: dict[str, Any] = {
            "vendor_name": name_s,
            "fiscal_year_label": fy,
            "login_ids_count": _parse_int_cell(_get_cell(ws, r, col_map, "login_ids_count")),
            "resume_inventory": _parse_resume_inventory(_get_cell(ws, r, col_map, "resume_inventory")),
            "job_postings": _parse_int_cell(_get_cell(ws, r, col_map, "job_postings")),
            "naukri_invites": _parse_int_cell(_get_cell(ws, r, col_map, "naukri_invites")),
            "utilization": None
            if _get_cell(ws, r, col_map, "utilization") in (None, "")
            else str(_get_cell(ws, r, col_map, "utilization")).strip() or None,
            "start_date": _parse_date(_get_cell(ws, r, col_map, "start_date")),
            "end_date": _parse_date(_get_cell(ws, r, col_map, "end_date")),
            "contract_duration_months": _parse_int_cell(
                _get_cell(ws, r, col_map, "contract_duration_months")
            ),
            "cost_inr": _parse_float_cell(_get_cell(ws, r, col_map, "cost_inr")),
            "primary_person_name": None
            if not _get_cell(ws, r, col_map, "primary_person_name")
            else str(_get_cell(ws, r, col_map, "primary_person_name")).strip() or None,
            "primary_person_phone": _phone_str(_get_cell(ws, r, col_map, "primary_person_phone")),
            "primary_person_email": None
            if not _get_cell(ws, r, col_map, "primary_person_email")
            else str(_get_cell(ws, r, col_map, "primary_person_email")).strip() or None,
            "secondary_person_name": None
            if not _get_cell(ws, r, col_map, "secondary_person_name")
            else str(_get_cell(ws, r, col_map, "secondary_person_name")).strip() or None,
            "secondary_person_phone": _phone_str(_get_cell(ws, r, col_map, "secondary_person_phone")),
            "secondary_person_email": None
            if not _get_cell(ws, r, col_map, "secondary_person_email")
            else str(_get_cell(ws, r, col_map, "secondary_person_email")).strip() or None,
            "remarks": None
            if not _get_cell(ws, r, col_map, "remarks")
            else str(_get_cell(ws, r, col_map, "remarks")).strip() or None,
            "_source_row": r,
        }
        out_rows.append(rec)
    if not out_rows:
        raise ValueError("No vendor data rows after header (check layout or empty sheet).")
    return {
        "fiscal_year_label": fy,
        "sheet": sheet_name,
        "row_count": len(out_rows),
        "rows": out_rows,
    }


def _apply_row(
    target: ResumeSupplierLicense,
    data: dict[str, Any],
    sort_order: int,
    user_id: Optional[int],
) -> None:
    for k in (
        "vendor_name",
        "login_ids_count",
        "resume_inventory",
        "job_postings",
        "naukri_invites",
        "utilization",
        "start_date",
        "end_date",
        "contract_duration_months",
        "cost_inr",
        "primary_person_name",
        "primary_person_phone",
        "primary_person_email",
        "secondary_person_name",
        "secondary_person_phone",
        "secondary_person_email",
        "remarks",
        "fiscal_year_label",
    ):
        if k in data:
            setattr(target, k, data[k])
    target.sort_order = sort_order
    if user_id is not None:
        target.updated_by_user_id = user_id
        if target.id is None:
            target.created_by_user_id = user_id


def ingest_workbook(
    path: str,
    db: Session,
    *,
    user_id: Optional[int] = None,
    dry_run: bool = False,
    replace_fy: bool = False,
) -> dict[str, Any]:
    """
    Load tracker workbook into `resume_supplier_licenses`.

    - *replace_fy*: delete all rows with the workbook's `fiscal_year_label`, then insert.
    - otherwise: upsert by (`fiscal_year_label`, `vendor_name`).
    """
    path = _xlsx_path(path)
    parsed = parse_workbook(path)
    fy = parsed["fiscal_year_label"]
    rows = parsed["rows"]
    issues: list[str] = []
    for i, row in enumerate(rows):
        if not row.get("vendor_name"):
            issues.append(f"row {row.get('_source_row')}: missing vendor name")
    if issues:
        raise ValueError("; ".join(issues))

    if dry_run:
        return {
            "dry_run": True,
            "fiscal_year_label": fy,
            "sheet": parsed["sheet"],
            "source_file": os.path.basename(path),
            "would_upsert": len(rows),
            "replace_fy": replace_fy,
            "sample": rows[0] if rows else None,
        }

    inserted = 0
    updated = 0
    deleted = 0

    if replace_fy:
        q = db.query(ResumeSupplierLicense).filter(ResumeSupplierLicense.fiscal_year_label == fy)
        for r in q.all():
            db.delete(r)
            deleted += 1
        db.flush()
        for i, data in enumerate(rows):
            d = {k: v for k, v in data.items() if not k.startswith("_")}
            rec = ResumeSupplierLicense(
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
            _apply_row(rec, d, i, user_id)
            db.add(rec)
            inserted += 1
    else:
        for i, data in enumerate(rows):
            d = {k: v for k, v in data.items() if not k.startswith("_")}
            vn = d["vendor_name"]
            ex = (
                db.query(ResumeSupplierLicense)
                .filter(
                    ResumeSupplierLicense.fiscal_year_label == fy,
                    ResumeSupplierLicense.vendor_name == vn,
                )
                .order_by(ResumeSupplierLicense.id.asc())
                .first()
            )
            if ex:
                _apply_row(ex, d, i, user_id)
                updated += 1
            else:
                rec = ResumeSupplierLicense(
                    created_by_user_id=user_id,
                    updated_by_user_id=user_id,
                )
                _apply_row(rec, d, i, user_id)
                db.add(rec)
                inserted += 1

    db.commit()
    return {
        "fiscal_year_label": fy,
        "sheet": parsed["sheet"],
        "source_file": os.path.basename(path),
        "inserted": inserted,
        "updated": updated,
        "deleted_prior": deleted,
        "row_count": len(rows),
    }
