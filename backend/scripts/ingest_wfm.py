import pandas as pd
import sys
import os
import datetime
from sqlalchemy.orm import Session

# Add project root to path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.db.database import SessionLocal, Project, WFMHRBenchmark, WFMResourceGap, init_db

def ingest_wfm_master(file_path):
    """
    Ingests the Workforce Management (WFM) master file, specifically the 
    "Projected HC - FY 26" sheet, which tracks Taggd recruiter productivity and staffing levels.
    """
    print(f"--- Starting WFM Ingestion for {os.path.basename(file_path)} ---")
    
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    init_db()
    db = SessionLocal()
    
    try:
        # 1. Load the "Projected HC - FY26" sheet (using header=None for positional mapping)
        # The data usually starts after several header rows. Analysis shows row 4 is a real data row.
        df = pd.read_excel(file_path, sheet_name='Projected HC - FY26', header=None)
        
        # 2. Iterative Ingestion
        projects_updated = 0
        benchmarks_saved = 0
        
        # Clean the DataFrame - skip header rows (0-2 usually)
        # We look for rows that have a Customer ID in Column 0
        data_rows = df.iloc[3:] # Row 3 or 4 seems to be first data row
        
        reporting_date = datetime.datetime(2025, 4, 1) # Target Fiscal Year Quarter Start e.g. FY26 Q1
        
        for idx, row in data_rows.iterrows():
            cust_id = str(row[0]).strip()
            # Valid data rows usually have a CNO ID or similar code in Col 0
            if not cust_id or cust_id == 'nan' or 'CNO' not in cust_id:
                continue
            
            # Positional Mapping based on analysis
            account_name = str(row[2]).strip() if pd.notnull(row[2]) else str(row[1]).strip()
            vertical = str(row[3]).strip()
            ph_head = str(row[7]).strip()
            region = str(row[8]).strip()
            
            # --- Quarter-Average Metrics (Lateral Revenue/HC/Prod/Ideal) ---
            # Total Revenue for FY is usually Col 14
            rev_total = float(row[14]) if pd.notnull(row[14]) and str(row[14]) != 'nan' else 0.0
            
            # Target HC (e.g. Total Average) - Column 20 or similar
            # Row 4: ... 6 6 6 6 6 (Col 16-20)
            target_hc = float(row[20]) if pd.notnull(row[20]) else 0.0
            
            # Target Productivity - Column 26 or similar
            target_prod = float(row[26]) if pd.notnull(row[26]) else 0.0
            
            # Ideal HC - Column 32 or similar
            ideal_hc = float(row[32]) if pd.notnull(row[32]) else 0.0
            
            # --- Current Distribution (WL Hires) ---
            # Row 4: ... 4 1 0 0 5 (Col 34-38)
            # col 34: WL1, col 35: WL2, col 36: WL3, col 37: WL4, col 38: Total
            wl1_c = int(row[34]) if pd.notnull(row[34]) and str(row[34]).isdigit() else 0
            wl2_c = int(row[35]) if pd.notnull(row[35]) and str(row[35]).isdigit() else 0
            wl3_c = int(row[36]) if pd.notnull(row[36]) and str(row[36]).isdigit() else 0
            wl4_c = int(row[37]) if pd.notnull(row[37]) and str(row[37]).isdigit() else 0
            actual_total = int(row[38]) if pd.notnull(row[38]) and str(row[38]).isdigit() else 0

            # 3. Synchronize Account (Project)
            # Fuzzy match or exact match on name
            project = db.query(Project).filter(Project.account_name == account_name).first()
            if not project:
                # If it doesn't exist, create it from WFM data
                project = Project(
                    account_name=account_name,
                    filename=os.path.basename(file_path),
                    source_filename=os.path.basename(file_path)
                )
                db.add(project)
                db.flush()
            
            # Update Meta
            project.vertical = vertical
            project.practice_head = ph_head
            project.region = region
            project.source_filename = os.path.basename(file_path)
            projects_updated += 1
            
            # 4. Create/Update Benchmarks
            # (Compound key: project_id + reporting_date)
            benchmark = db.query(WFMHRBenchmark).filter(
                WFMHRBenchmark.project_id == project.id,
                WFMHRBenchmark.reporting_date == reporting_date
            ).first()
            
            if not benchmark:
                benchmark = WFMHRBenchmark(
                    project_id=project.id, 
                    reporting_date=reporting_date,
                    source_filename=os.path.basename(file_path)
                )
                db.add(benchmark)
            
            benchmark.lateral_revenue_target = rev_total
            benchmark.lateral_hc_target = target_hc
            benchmark.lateral_productivity_target = target_prod
            benchmark.ideal_hc = ideal_hc
            benchmark.actual_hc_total = actual_total
            benchmark.wl1_hires = wl1_c
            benchmark.wl2_hires = wl2_c
            benchmark.wl3_hires = wl3_c
            benchmark.wl4_hires = wl4_c
            benchmark.source_filename = os.path.basename(file_path)
            
            benchmarks_saved += 1

        db.commit()
        print(f"\n--- Ingestion Successful ---")
        print(f"Projects updated with WFM Metadata: {projects_updated}")
        print(f"WFM Snapshots/Benchmarks stored: {benchmarks_saved}")

    except Exception as e:
        db.rollback()
        print(f"Error during WFM ingestion: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    WFM_FILE = "/Users/arjun/Software/tgddata/excel_files_imp/WFM (Projected Headcount & Revenue).xlsx"
    ingest_wfm_master(WFM_FILE)
