import pandas as pd
import sys
import os
import datetime
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
)
from backend.db.finance_dedupe import dedupe_finance_tables

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
    except:
        pass
    return None

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
            return project

        # 2. Ingest Revenue & CM (Budget, Actual, Forecast)
        # Mapping metric types to sheets
        # Format: (SheetName, Category, ColumnValueType [budget, forecast, actual])
        sheets_to_process = [
            ('Revenue_Budget', 'Revenue', 'budget'),
            ('Revenue_Actual', 'Revenue', 'actual'),
            ('Rev_Forecast', 'Revenue', 'forecast'),
            ('CM_Budget', 'Contribution Margin', 'budget'),
            ('CM_Actual', 'Contribution Margin', 'actual'),
            ('CM_Forecast', 'Contribution Margin', 'forecast'),
            ('Actual Cost', 'Cost', 'actual')
        ]
        
        for sheet_name, category, val_type in sheets_to_process:
            print(f"Processing {sheet_name}...")
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # Identify Month columns (Flexible detection for strings OR Datetime objects)
                col_map = {}
                for col in df.columns:
                    if isinstance(col, datetime.datetime):
                        col_map[col] = col
                    elif isinstance(col, str):
                        for m in months:
                            if m.lower() in col.lower():
                                col_map[m] = col
                                break
                
                for _, row in df.iterrows():
                    p_name = row.get('Project') or row.get('Account') or row.get('Client')
                    project = get_project(p_name)
                    if not project: continue
                    
                    for m_ref, excel_col in col_map.items():
                        # Determine reporting date
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            fy_str = str(row.get('FY') or row.get('Fiscal Year') or 'FY2024-25')
                            reporting_date = get_month_date(m_ref, fy_str)
                        
                        if not reporting_date: continue
                        
                        val = float(row[excel_col]) if pd.notnull(row[excel_col]) else 0.0

                        # Unit Normalization: Auto-correct Lacs to absolute INR for financial fields
                        # Most revenue/cost values in the finance master are Lacs (e.g. 15.0)
                        if 0 < abs(val) < 2000: # Broad threshold for Lacs normalization
                            val *= 100000
                        
                        # Upsert Ledger
                        ledger = db.query(FinanceMonthlyLedger).filter(
                            FinanceMonthlyLedger.project_id == project.id,
                            FinanceMonthlyLedger.reporting_month == reporting_date,
                            FinanceMonthlyLedger.metric_category == category
                        ).first()
                        
                        if not ledger:
                            ledger = FinanceMonthlyLedger(
                                project_id=project.id, 
                                reporting_month=reporting_date, 
                                metric_category=category,
                                source_filename=source_fn
                            )
                            db.add(ledger)
                            db.flush()

                        # Correct assignment logic
                        attr_name = f"{val_type}_value"
                        if category == 'Cost' and val_type == 'actual':
                            attr_name = "actual_cost"
                            
                        setattr(ledger, attr_name, val)
                        ledger.source_filename = source_fn
            except Exception as e:
                print(f"Warning: Skipped sheet {sheet_name} due to error: {e}")

        # 3. Ingest Cash Flow (Unbilled, Collection, Bad Debt)
        # Using separate sheets for simplicity in logic
        cash_flow_sheets = {
            'Unbilled': 'unbilled_amount',
            'Revenue_Collected': 'actual_collected',
            'Collection Target': 'collection_target',
            'Bad Debt': 'bad_debt'
        }
        
        for sheet_name, db_field in cash_flow_sheets.items():
            print(f"Processing Cash Flow: {sheet_name}...")
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # Identify Month columns (Flexible detection)
                col_map = {}
                for col in df.columns:
                    if isinstance(col, datetime.datetime):
                        col_map[col] = col
                    elif isinstance(col, str):
                        for m in months:
                            if m.lower() in col.lower():
                                col_map[m] = col
                                break
                
                for _, row in df.iterrows():
                    p_name = row.get('Project') or row.get('Account') or row.get('Client')
                    project = get_project(p_name)
                    if not project: continue

                    for m_ref, excel_col in col_map.items():
                        # Determine reporting date
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            fy_str = str(row.get('FY') or row.get('Fiscal Year') or 'FY2024-25')
                            reporting_date = get_month_date(m_ref, fy_str)
                        
                        if not reporting_date: continue
                        val = float(row[excel_col]) if pd.notnull(row[excel_col]) else 0.0
                        
                        # Unit Normalization: Auto-correct Cash Flow values to absolute INR
                        if 0 < abs(val) < 2000:
                            val *= 100000
                        
                        cf = db.query(FinanceCashFlow).filter(
                            FinanceCashFlow.project_id == project.id,
                            FinanceCashFlow.reporting_month == reporting_date
                        ).first()
                        if not cf:
                            cf = FinanceCashFlow(project_id=project.id, reporting_month=reporting_date, source_filename=source_fn)
                            db.add(cf)
                            db.flush()
                        setattr(cf, db_field, val)
                        cf.source_filename = source_fn
            except Exception as e:
                print(f"Error in {sheet_name}: {e}")

        # 4. Ingest Efficiency KPIs
        print("Processing Efficiency Strategy...")
        # Sheets: Target_Rev_Productivity, Approved_Headcount, Actual_Headcount Overall, Actual Headcount WL1,
        # Taggd_Source_Joiner, Actual_PPC
        kpi_sheets = {
            'Target_Rev_Productivity': 'target_revenue_per_recruiter',
            'Approved_Headcount': 'approved_headcount',
            'Actual_Headcount Overall': 'actual_headcount_finance',
            'Actual Headcount WL1': 'actual_headcount_wl1',
            'Taggd_Source_Joiner': 'taggd_joiners',
            'Actual_PPC': 'actual_ppc'
        }
        
        for sheet_name, db_field in kpi_sheets.items():
            print(f"Ingesting KPI sheet: {sheet_name}")
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                
                # Identify Month columns (Flexible detection)
                col_map = {}
                for col in df.columns:
                    if isinstance(col, datetime.datetime):
                        col_map[col] = col
                    elif isinstance(col, str):
                        for m in months:
                            if m.lower() in col.lower():
                                col_map[m] = col
                                break

                for _, row in df.iterrows():
                    p_name = row.get('Project') or row.get('Account') or row.get('Client')
                    project = get_project(p_name)
                    if not project: continue
                    
                    for m_ref, excel_col in col_map.items():
                        # Determine reporting date
                        if isinstance(excel_col, datetime.datetime):
                            reporting_date = excel_col
                        else:
                            fy_str = str(row.get('FY') or row.get('Fiscal Year') or 'FY2024-25')
                            reporting_date = get_month_date(m_ref, fy_str)
                        
                        if not reporting_date: continue
                        val = row[excel_col] if pd.notnull(row[excel_col]) else 0
                        try:
                            if isinstance(val, str):
                                val = val.strip()
                                if val == "" or val in ("-", "—"):
                                    val = 0
                            val = float(val)
                        except (TypeError, ValueError):
                            val = 0.0
                        
                        # Unit Normalization: Apply to revenue-based KPIs only, not headcount
                        headcount_fields = (
                            'approved_headcount',
                            'actual_headcount_finance',
                            'actual_headcount_wl1',
                            'taggd_joiners',
                        )
                        if db_field not in headcount_fields:
                            if isinstance(val, (int, float)) and 0 < abs(val) < 2000:
                                val *= 100000
                        
                        kpi = db.query(FinanceEfficiencyKPI).filter(
                            FinanceEfficiencyKPI.project_id == project.id,
                            FinanceEfficiencyKPI.reporting_month == reporting_date
                        ).first()
                        if not kpi:
                            kpi = FinanceEfficiencyKPI(project_id=project.id, reporting_month=reporting_date, source_filename=source_fn)
                            db.add(kpi)
                            db.flush()
                        setattr(kpi, db_field, val)
                        kpi.source_filename = source_fn
            except Exception as e:
                print(f"Error in {sheet_name}: {e}")

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
