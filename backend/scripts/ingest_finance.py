import pandas as pd
import sys
import os
import datetime
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

# Add project root to path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.db.database import (
    SessionLocal,
    Project,
    FinanceMonthlyLedger,
    FinanceCashFlow,
    FinanceEfficiencyKPI,
    init_db,
    ensure_project_client,
)
from backend.db.finance_dedupe import dedupe_finance_tables


def _norm_sheet_token(s: str) -> str:
    """Lowercase, collapse spaces, treat underscores as spaces — for matching variant tab names."""
    t = str(s).strip().lower().replace("_", " ")
    return " ".join(t.split())


def _pick_sheet(xl: pd.ExcelFile, *candidates: str) -> Optional[str]:
    """
    Return the first workbook sheet that matches any candidate (exact match first,
    then normalized token match). None if no sheet matches.
    """
    names = list(xl.sheet_names)
    exact = set(names)
    norm_to_sheet: dict[str, str] = {}
    for n in names:
        k = _norm_sheet_token(n)
        if k not in norm_to_sheet:
            norm_to_sheet[k] = n
    for raw in candidates:
        if raw in exact:
            return raw
        k = _norm_sheet_token(raw)
        if k in norm_to_sheet:
            return norm_to_sheet[k]
    return None


def _account_from_row(row) -> str | None:
    for key in ("Project", "Account", "Client", "Customer", "Account Name"):
        v = row.get(key)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if not s or s.lower() in ("nan", "total", "grand total", "subtotal"):
            continue
        return s
    return None


def _normalize_account_key(name: str) -> str:
    """Collapse whitespace for stable matching; compare keys case-insensitively."""
    s = " ".join(str(name).strip().split())
    return s


def get_month_date(month_str, fiscal_year_str):
    """
    Helper to convert month names and FY strings into actual datetimes.
    FY2024-25, month 'Apr' -> 2024-04-01
    FY2024-25, month 'Jan' -> 2025-01-01
    """
    try:
        years = fiscal_year_str.replace("FY", "").split("-")
        start_year = int(years[0])
        end_year = 2000 + int(years[1]) if len(years[1]) == 2 else int(years[1])
        
        # Month map
        month_map = {
            'Apr': (4, start_year), 'May': (5, start_year), 'Jun': (6, start_year),
            'Jul': (7, start_year), 'Aug': (8, start_year), 'Sep': (9, start_year),
            'Oct': (10, start_year), 'Nov': (11, start_year), 'Dec': (12, start_year),
            'Jan': (1, end_year), 'Feb': (2, end_year), 'Mar': (3, end_year)
        }
        
        m, y = month_map.get(month_str[:3], (None, None))
        if m:
            return datetime.datetime(y, m, 1)
    except Exception:
        pass
    return None


def _fy_from_row(row) -> str:
    for k in ("FY", "Fiscal Year", "Financial Year", "FY Year"):
        v = row.get(k)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if s and s.lower() != "nan":
            return s
    return "FY2024-25"


def _month_column_map(df: pd.DataFrame, months: list[str]) -> dict:
    col_map: dict = {}
    for col in df.columns:
        if isinstance(col, datetime.datetime):
            col_map[col] = col
        elif isinstance(col, str):
            for m in months:
                if m.lower() in col.lower():
                    col_map[m] = col
                    break
    return col_map


def ingest_finance_master(file_path):
    """
    Ingests the Master Corporate Finance file (FY24-25_Finance Data.xlsx).
    Handles multiple sheets for Revenue, CM, Cost, Cash Flow, and KPIs.
    """
    print(f"--- Starting Corporate Finance Ingestion for {os.path.basename(file_path)} ---")
    
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    init_db()
    db = SessionLocal()
    source_fn = os.path.basename(file_path)
    
    try:
        # We'll use a standard set of months for horizontal parsing (Apr to Mar)
        months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

        xl = pd.ExcelFile(file_path)
        print(f"Workbook sheets ({len(xl.sheet_names)}): {', '.join(xl.sheet_names[:12])}{'…' if len(xl.sheet_names) > 12 else ''}")

        # 1. Helper to find or create project (case-insensitive + whitespace — avoids TATA vs Tata duplicate rows)
        def get_project(account_name):
            canon = _normalize_account_key(account_name)
            if not canon or canon.lower() == "nan":
                return None

            key = canon.lower()
            project = (
                db.query(Project)
                .filter(func.lower(func.trim(Project.account_name)) == key)
                .first()
            )
            if not project:
                project = Project(account_name=canon, filename=source_fn, source_filename=source_fn)
                db.add(project)
                db.flush()
                ensure_project_client(db, project)
            elif project.client_id is None:
                ensure_project_client(db, project)
            return project

        # 2. Ingest Revenue & CM (Budget, Actual, Forecast) + optional Cost
        # Each entry: (list of sheet name aliases..., category, val_type for ledger attr)
        ledger_specs: list[tuple[tuple[str, ...], str, str]] = [
            (("Revenue_Budget", "Revenue Budget"), "Revenue", "budget"),
            (("Revenue_Actual", "Revenue Actual"), "Revenue", "actual"),
            (("Rev_Forecast", "Rev Forecast", "Revenue Forecast"), "Revenue", "forecast"),
            (("CM_Budget", "CM Budget"), "Contribution Margin", "budget"),
            (("CM_Actual", "CM Actual"), "Contribution Margin", "actual"),
            (("CM_Forecast", "CM Forecast"), "Contribution Margin", "forecast"),
            (
                (
                    "Actual Cost",
                    "Actual_Cost",
                    "Cost_Actual",
                    "Actual Cost Sheet",
                ),
                "Cost",
                "actual",
            ),
        ]

        for aliases, category, val_type in ledger_specs:
            sheet = _pick_sheet(xl, *aliases)
            if not sheet:
                print(f"Warning: No sheet found for {aliases[0]} ({category} / {val_type}); skipping.")
                continue
            print(f"Processing ledger sheet «{sheet}» → {category} ({val_type})...")
            try:
                df = xl.parse(sheet)
                col_map = _month_column_map(df, months)
                if not col_map:
                    print(f"  Warning: No month columns detected on «{sheet}»; skipping.")
                    continue

                for _, row in df.iterrows():
                    p_name = _account_from_row(row)
                    project = get_project(p_name)
                    if not project:
                        continue

                    for m_ref, excel_col in col_map.items():
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            reporting_date = get_month_date(m_ref, _fy_from_row(row))

                        if not reporting_date:
                            continue

                        val = float(row[excel_col]) if pd.notnull(row[excel_col]) else 0.0

                        if 0 < abs(val) < 2000:
                            val *= 100000

                        ledger = (
                            db.query(FinanceMonthlyLedger)
                            .filter(
                                FinanceMonthlyLedger.project_id == project.id,
                                FinanceMonthlyLedger.reporting_month == reporting_date,
                                FinanceMonthlyLedger.metric_category == category,
                            )
                            .first()
                        )

                        if not ledger:
                            ledger = FinanceMonthlyLedger(
                                project_id=project.id,
                                reporting_month=reporting_date,
                                metric_category=category,
                                source_filename=source_fn,
                            )
                            db.add(ledger)
                            db.flush()

                        attr_name = f"{val_type}_value"
                        if category == "Cost" and val_type == "actual":
                            attr_name = "actual_cost"

                        setattr(ledger, attr_name, val)
                        ledger.source_filename = source_fn
            except Exception as e:
                print(f"Warning: Skipped «{sheet}» ({aliases[0]}) due to error: {e}")

        # 3. Ingest Cash Flow (Unbilled, Collection, Bad Debt)
        cash_flow_specs: list[tuple[tuple[str, ...], str]] = [
            (("Unbilled", "Unbilled Amount"), "unbilled_amount"),
            (
                (
                    "Revenue_Collected",
                    "Revenue Collected",
                    "Actual_Collection",
                    "Actual Collection",
                    "Revenue Collected Actual",
                ),
                "actual_collected",
            ),
            (
                (
                    "Collection Target",
                    "Collection_Target",
                    "Target_Collection",
                    "Target Collection",
                ),
                "collection_target",
            ),
            (("Bad Debt", "Bad_Debt"), "bad_debt"),
        ]

        for aliases, db_field in cash_flow_specs:
            sheet = _pick_sheet(xl, *aliases)
            if not sheet:
                print(f"Warning: No cash-flow sheet for {aliases[0]} → {db_field}; skipping.")
                continue
            print(f"Processing cash flow «{sheet}» → {db_field}...")
            try:
                df = xl.parse(sheet)
                col_map = _month_column_map(df, months)
                if not col_map:
                    print(f"  Warning: No month columns on «{sheet}»; skipping.")
                    continue

                for _, row in df.iterrows():
                    p_name = _account_from_row(row)
                    project = get_project(p_name)
                    if not project:
                        continue

                    for m_ref, excel_col in col_map.items():
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            reporting_date = get_month_date(m_ref, _fy_from_row(row))

                        if not reporting_date:
                            continue
                        val = float(row[excel_col]) if pd.notnull(row[excel_col]) else 0.0

                        if 0 < abs(val) < 2000:
                            val *= 100000

                        cf = (
                            db.query(FinanceCashFlow)
                            .filter(
                                FinanceCashFlow.project_id == project.id,
                                FinanceCashFlow.reporting_month == reporting_date,
                            )
                            .first()
                        )
                        if not cf:
                            cf = FinanceCashFlow(
                                project_id=project.id,
                                reporting_month=reporting_date,
                                source_filename=source_fn,
                            )
                            db.add(cf)
                            db.flush()
                        setattr(cf, db_field, val)
                        cf.source_filename = source_fn
            except Exception as e:
                print(f"Error in cash flow «{sheet}» ({aliases[0]}): {e}")

        # 4. Ingest Efficiency KPIs
        print("Processing Efficiency Strategy...")
        kpi_specs: list[tuple[tuple[str, ...], str]] = [
            (
                (
                    "Target_Rev_Productivity",
                    "Target Rev Productivity",
                    "TargetRevProductivity",
                ),
                "target_revenue_per_recruiter",
            ),
            (
                ("Approved_Headcount", "Headcount_Approved", "Approved Headcount", "Headcount Approved"),
                "approved_headcount",
            ),
            (
                (
                    "Actual_Headcount Overall",
                    "Actual Headcount Overall",
                    "Headcount_Overall",
                    "Headcount Overall",
                ),
                "actual_headcount_finance",
            ),
            (
                (
                    "Actual Headcount WL1",
                    "Actual_Headcount WL1",
                    "Headcount_WL1",
                    "Headcount WL1",
                ),
                "actual_headcount_wl1",
            ),
            (
                ("Taggd_Source_Joiner", "Taggd Source Joiner", "Taggd_Joiner", "Taggd Joiners"),
                "taggd_joiners",
            ),
        ]

        for aliases, db_field in kpi_specs:
            sheet = _pick_sheet(xl, *aliases)
            if not sheet:
                print(f"Warning: No KPI sheet for {aliases[0]} → {db_field}; skipping.")
                continue
            print(f"Ingesting KPI «{sheet}» → {db_field}...")
            try:
                df = xl.parse(sheet)
                col_map = _month_column_map(df, months)
                if not col_map:
                    print(f"  Warning: No month columns on «{sheet}»; skipping.")
                    continue

                for _, row in df.iterrows():
                    p_name = _account_from_row(row)
                    project = get_project(p_name)
                    if not project:
                        continue

                    for m_ref, excel_col in col_map.items():
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            reporting_date = get_month_date(m_ref, _fy_from_row(row))

                        if not reporting_date:
                            continue
                        val = row[excel_col] if pd.notnull(row[excel_col]) else 0
                        try:
                            if isinstance(val, str):
                                val = val.strip()
                                if val == "" or val in ("-", "—"):
                                    val = 0
                            val = float(val)
                        except (TypeError, ValueError):
                            val = 0.0

                        headcount_fields = (
                            "approved_headcount",
                            "actual_headcount_finance",
                            "actual_headcount_wl1",
                            "taggd_joiners",
                        )
                        if db_field not in headcount_fields:
                            if isinstance(val, (int, float)) and 0 < abs(val) < 2000:
                                val *= 100000

                        kpi = (
                            db.query(FinanceEfficiencyKPI)
                            .filter(
                                FinanceEfficiencyKPI.project_id == project.id,
                                FinanceEfficiencyKPI.reporting_month == reporting_date,
                            )
                            .first()
                        )
                        if not kpi:
                            kpi = FinanceEfficiencyKPI(
                                project_id=project.id,
                                reporting_month=reporting_date,
                                source_filename=source_fn,
                            )
                            db.add(kpi)
                            db.flush()
                        setattr(kpi, db_field, val)
                        kpi.source_filename = source_fn
            except Exception as e:
                print(f"Error in KPI «{sheet}» ({aliases[0]}): {e}")

        dedupe_finance_tables(db)
        db.commit()
        print("\n--- Corporate Finance Ingestion Successful ---")

    except Exception as e:
        db.rollback()
        print(f"FATAL Error during Finance Ingestion: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    FINANCE_FILE = "/Users/arjun/Software/tgddata/excel_files_imp/FY24-25_Finance Data.xlsx"
    ingest_finance_master(FINANCE_FILE)
