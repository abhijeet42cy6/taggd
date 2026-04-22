"""
Ingest `Project Signup Renewal Detail.xlsx` — Contract Data sheet into `project_contracts`.

Resolves each row's **Customer** with `resolve_project_for_sla` (same as SLA/revenue) so
**Group → SBU** and **Client → projects** links match the directory, not a loose name match.

Upserts: one canonical row per `project_id` for this file — updates a row with the same
`source_filename` if present, otherwise the latest row for that project, else inserts. Avoids
duplicate contract rows on every re-run.

Skips totals, legend, and non-data rows.
"""
from __future__ import annotations

import os
import sys
from collections import Counter
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.sla_project_resolve import resolve_project_for_sla  # noqa: E402
from backend.db.database import (  # noqa: E402
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


def _existing_contract_for_upsert(
    db: Session, project_id: int, source_basename: str
) -> Optional[ProjectContract]:
    """Prefer row from a previous run of the same file; else latest row for this project."""
    ex = (
        db.query(ProjectContract)
        .filter(
            ProjectContract.project_id == project_id,
            ProjectContract.source_filename == source_basename,
        )
        .order_by(ProjectContract.id.desc())
        .first()
    )
    if ex:
        return ex
    return (
        db.query(ProjectContract)
        .filter(ProjectContract.project_id == project_id)
        .order_by(ProjectContract.id.desc())
        .first()
    )


def _apply_row_to_contract(
    c: ProjectContract,
    *,
    proj_id: int,
    client_id: Optional[int],
    customer_s: str,
    file_path: str,
    cell: Any,
    ri: int,
) -> None:
    acv_l = _float(cell(ri, "Signed ACV (₹L)"))
    signed_acv_inr = acv_l * 100_000.0 if acv_l is not None else None
    cm = _float(cell(ri, "Signed CM%"))
    hc = _float(cell(ri, "HC (Headcount)"))
    c.project_id = proj_id
    c.client_id = client_id
    c.customer_name = customer_s
    c.account_type = (
        _norm(str(cell(ri, "Account Type")))
        if cell(ri, "Account Type") is not None and not pd.isna(cell(ri, "Account Type"))
        else None
    )
    c.contract_start_date = _parse_excel_date(cell(ri, "Date of Signing"))
    c.contract_end_date = _parse_excel_date(cell(ri, "Renewal Date"))
    c.signed_acv_inr = signed_acv_inr
    c.contract_status = (
        _norm(str(cell(ri, "Current Status")))
        if cell(ri, "Current Status") is not None and not pd.isna(cell(ri, "Current Status"))
        else None
    )
    c.signed_cm_pct = cm
    c.headcount_contracted = hc
    c.hiring_volume = _float(cell(ri, "Hiring Volume"))
    c.taggd_source_mix = None if pd.isna(cell(ri, "Taggd Source MIX")) else str(cell(ri, "Taggd Source MIX")).strip() or None
    c.other_source_mix = None if pd.isna(cell(ri, "Other Source Mix")) else str(cell(ri, "Other Source Mix")).strip() or None
    c.overall_rph = _float(cell(ri, "Overall RPH")) or _float(cell(ri, "Overall RPH  Number"))
    c.mmf_applicable = _yes_no(cell(ri, "MMF"))
    c.opening_fee_applicable = _yes_no(cell(ri, "Opening Fee"))
    c.payment_terms = None if pd.isna(cell(ri, "Payment Terms")) else str(cell(ri, "Payment Terms")).strip() or None
    c.pricing_model = None if pd.isna(cell(ri, "Pricing Model")) else str(cell(ri, "Pricing Model")).strip() or None
    c.contract_detail = None if pd.isna(cell(ri, "Detail")) else str(cell(ri, "Detail")).strip() or None
    c.remarks = None if pd.isna(cell(ri, "Remarks")) else str(cell(ri, "Remarks")).strip() or None
    c.source_filename = os.path.basename(file_path)
    c.pipeline_stage = c.pipeline_stage or "discovery"


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
    updated = 0
    skipped = 0
    missing_projects: list[str] = []
    errors: list[str] = []
    reason_counts: Counter = Counter()
    resolution_log: List[str] = []

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

        base_name = os.path.basename(file_path)

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
            proj, rreason = resolve_project_for_sla(db, customer_s)
            if not proj:
                missing_projects.append(customer_s)
                skipped += 1
                continue

            reason_counts[rreason] += 1
            if proj.client_id is None:
                ensure_project_client(db, proj)
            client_id = proj.client_id

            existing = _existing_contract_for_upsert(db, proj.id, base_name)
            if existing is not None:
                _apply_row_to_contract(
                    existing,
                    proj_id=proj.id,
                    client_id=client_id,
                    customer_s=customer_s,
                    file_path=file_path,
                    cell=cell,
                    ri=ri,
                )
                resolution_log.append(
                    f"UPDATE {customer_s!r} → PRJ-{proj.id} (client_id={client_id}, match={rreason}, contract_id={existing.id})"
                )
                updated += 1
            else:
                c = ProjectContract(
                    project_id=proj.id,
                    client_id=client_id,
                    pipeline_stage="discovery",
                )
                _apply_row_to_contract(
                    c,
                    proj_id=proj.id,
                    client_id=client_id,
                    customer_s=customer_s,
                    file_path=file_path,
                    cell=cell,
                    ri=ri,
                )
                db.add(c)
                resolution_log.append(
                    f"INSERT {customer_s!r} → PRJ-{proj.id} (client_id={client_id}, match={rreason})"
                )
                created += 1
            db.flush()

        db.commit()
        out: Dict[str, Any] = {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "missing_customer_no_project": missing_projects,
            "match_reason_counts": dict(reason_counts),
            "file": base_name,
            "resolution_log": resolution_log,
        }
        return out
    except Exception as e:
        db.rollback()
        errors.append(str(e))
        return {"error": errors[0], "created": 0, "updated": 0, "skipped": skipped}
    finally:
        if own:
            db.close()


def _write_ingest_report(file_path: str, result: Dict[str, Any]) -> str:
    """Write a markdown report next to the workbook; return the path written."""
    out_path = os.path.join(os.path.dirname(os.path.abspath(file_path)), "contract_workbook_ingest_report.md")
    lines = [
        "# Contract workbook ingest report",
        "",
        f"**File:** `{os.path.basename(file_path)}`  ",
        f"**Source path:** `{file_path}`  ",
        "",
        "## Summary",
        "",
    ]
    if result.get("error"):
        lines.append(f"- **Error:** {result['error']}")
        lines.append("")
    else:
        lines.extend(
            [
                f"- **Created:** {result.get('created', 0)}",
                f"- **Updated (upsert):** {result.get('updated', 0)}",
                f"- **Skipped rows:** {result.get('skipped', 0)}",
                "",
            ]
        )
        mrc = result.get("match_reason_counts") or {}
        if mrc:
            lines.append("### Project resolution (same rules as SLA directory)")
            lines.append("")
            for k, v in sorted(mrc.items(), key=lambda x: -x[1]):
                lines.append(f"- `{k}`: **{v}**")
            lines.append("")
        miss = result.get("missing_customer_no_project") or []
        if miss:
            lines.append("### Unmatched `Customer` values (no project in DB)")
            lines.append("")
            for m in miss:
                lines.append(f"- {m!r}")
            lines.append("")
        rlog = result.get("resolution_log") or []
        if rlog:
            lines.append("## Row resolution log")
            lines.append("")
            for line in rlog:
                lines.append(f"- {line}")
            lines.append("")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return out_path


def main():
    import argparse

    init_db()
    ap = argparse.ArgumentParser(description="Ingest contract workbook Contract Data sheet")
    ap.add_argument("file", help="Path to .xlsx")
    ap.add_argument("--no-report", action="store_true", help="Do not write contract_workbook_ingest_report.md")
    args = ap.parse_args()
    r = ingest_contract_workbook_file(args.file)
    print(r)
    if not r.get("error") and not args.no_report:
        rp = _write_ingest_report(args.file, r)
        print("Report:", rp)


if __name__ == "__main__":
    main()
