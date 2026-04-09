"""
Ingest `Project Signup Renewal Detail.xlsx` — Contract Data sheet into `project_contracts`.

Matches each row's Customer to `Project.account_name` (case-insensitive, trimmed).
Skips totals, legend, and non-data rows.
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime
from typing import Any, Dict, Optional

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db.database import (  # noqa: E402
    Project,
    ProjectContract,
    SessionLocal,
    ensure_project_client,
    init_db,
)


def _norm(s: str) -> str:
    return " ".join(str(s).strip().split())


def _parse_excel_date(val: Any) -> Optional[date]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s or s.lower() == "nan":
        return None
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:20], fmt).date()
        except ValueError:
            continue
    try:
        return pd.to_datetime(s, dayfirst=True).date()
    except Exception:
        return None


def _yes_no(val: Any) -> Optional[bool]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip().lower()
    if s in ("yes", "y", "true", "1"):
        return True
    if s in ("no", "n", "false", "0"):
        return False
    return None


def _float(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _find_project_by_customer(db: Session, customer: str) -> Optional[Project]:
    key = _norm(customer).lower()
    if not key:
        return None
    return (
        db.query(Project)
        .filter(func.lower(func.trim(Project.account_name)) == key)
        .first()
    )


def ingest_contract_workbook_file(
    file_path: str,
    db: Session | None = None,
    *,
    user: Any | None = None,
) -> Dict[str, Any]:
    own = db is None
    if own:
        db = SessionLocal()
    created = 0
    skipped = 0
    missing_projects: list[str] = []
    errors: list[str] = []

    try:
        raw = pd.read_excel(file_path, sheet_name="Contract Data", header=None)
        header_idx = None
        for i in range(min(15, len(raw))):
            row = raw.iloc[i]
            if str(row.iloc[0]).strip() == "#" and "Customer" in str(row.iloc[1]):
                header_idx = i
                break
        if header_idx is None:
            return {"error": "Could not find Contract Data header row (#, Customer, …)", "created": 0}

        headers = [str(raw.iloc[header_idx, j]).strip().replace("\n", " ") for j in range(raw.shape[1])]
        col_index: Dict[str, int] = {}
        for j, h in enumerate(headers):
            if h and h.lower() != "nan":
                col_index[h] = j

        def cell(row_idx: int, *names: str) -> Any:
            for n in names:
                if n in col_index:
                    return raw.iloc[row_idx, col_index[n]]
            return None

        for ri in range(header_idx + 1, len(raw)):
            row = raw.iloc[ri]
            first = row.iloc[0]
            if pd.isna(first):
                continue
            if isinstance(first, str) and "total" in first.lower():
                break
            if isinstance(first, str) and "legend" in first.lower():
                break
            try:
                int(float(first))
            except (TypeError, ValueError):
                continue

            customer = cell(ri, "Customer")
            if customer is None or str(customer).strip() in ("", "nan"):
                skipped += 1
                continue
            customer_s = _norm(str(customer))
            proj = _find_project_by_customer(db, customer_s)
            if not proj:
                missing_projects.append(customer_s)
                skipped += 1
                continue

            if proj.client_id is None:
                ensure_project_client(db, proj)

            acv_l = _float(cell(ri, "Signed ACV (₹L)"))
            signed_acv_inr = acv_l * 100_000.0 if acv_l is not None else None

            cm = _float(cell(ri, "Signed CM%"))
            hc = _float(cell(ri, "HC (Headcount)"))

            c = ProjectContract(
                project_id=proj.id,
                client_id=proj.client_id,
                customer_name=customer_s,
                account_type=_norm(str(cell(ri, "Account Type"))) if cell(ri, "Account Type") is not None and not pd.isna(cell(ri, "Account Type")) else None,
                contract_start_date=_parse_excel_date(cell(ri, "Date of Signing")),
                contract_end_date=_parse_excel_date(cell(ri, "Renewal Date")),
                signed_acv_inr=signed_acv_inr,
                contract_status=_norm(str(cell(ri, "Current Status"))) if cell(ri, "Current Status") is not None and not pd.isna(cell(ri, "Current Status")) else None,
                signed_cm_pct=cm,
                headcount_contracted=hc,
                hiring_volume=_float(cell(ri, "Hiring Volume")),
                taggd_source_mix=None if pd.isna(cell(ri, "Taggd Source MIX")) else str(cell(ri, "Taggd Source MIX")).strip() or None,
                other_source_mix=None if pd.isna(cell(ri, "Other Source Mix")) else str(cell(ri, "Other Source Mix")).strip() or None,
                overall_rph=_float(cell(ri, "Overall RPH")),
                mmf_applicable=_yes_no(cell(ri, "MMF")),
                opening_fee_applicable=_yes_no(cell(ri, "Opening Fee")),
                payment_terms=None if pd.isna(cell(ri, "Payment Terms")) else str(cell(ri, "Payment Terms")).strip() or None,
                pricing_model=None if pd.isna(cell(ri, "Pricing Model")) else str(cell(ri, "Pricing Model")).strip() or None,
                contract_detail=None if pd.isna(cell(ri, "Detail")) else str(cell(ri, "Detail")).strip() or None,
                remarks=None if pd.isna(cell(ri, "Remarks")) else str(cell(ri, "Remarks")).strip() or None,
                source_filename=os.path.basename(file_path),
            )
            db.add(c)
            created += 1

        db.commit()
        return {
            "created": created,
            "skipped": skipped,
            "missing_customer_no_project": missing_projects,
            "file": os.path.basename(file_path),
        }
    except Exception as e:
        db.rollback()
        errors.append(str(e))
        return {"error": errors[0], "created": 0, "skipped": skipped}
    finally:
        if own:
            db.close()


def main():
    import argparse

    init_db()
    ap = argparse.ArgumentParser(description="Ingest contract workbook Contract Data sheet")
    ap.add_argument("file", help="Path to .xlsx")
    args = ap.parse_args()
    r = ingest_contract_workbook_file(args.file)
    print(r)


if __name__ == "__main__":
    main()
