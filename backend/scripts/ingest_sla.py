import pandas as pd
import sys
import os
import datetime
from sqlalchemy.orm import Session

# Add project root to path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.db.database import SessionLocal, Project, MetricDefinition, SLAPerformance, init_db, backfill_sla_period_starts
from backend.core.sla_period import canonical_month_label, parse_sla_score_column_name

def ingest_sla(file_path, db=None):
    """
    Standalone script to ingest the "Raw Data SLA Basefile.xlsx" into the new 
    multi-tenant metrics database structure.
    """
    print(f"--- Starting SLA Ingestion for {os.path.basename(file_path)} ---")
    
    # 0. Environment Check
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    # Initialize DB (creates new tables if they don't exist)
    init_db()
    
    # Create session if not provided
    external_session = db is not None
    if not external_session:
        db = SessionLocal()
    
    try:
        # Align legacy rows to calendar months (period_start + YYYY-MM) before upserts
        bf = backfill_sla_period_starts(db)
        if bf:
            print(f"Aligned {bf} legacy SLA performance rows to calendar months.")

        # 1. Load Data
        # We load "Base File" sheet. Based on analysis, row 0 contains the primary headers.
        try:
            df = pd.read_excel(file_path, sheet_name="Base File", header=0)
        except ValueError as e:
            xl = pd.ExcelFile(file_path)
            sheets = ", ".join(xl.sheet_names[:20])
            raise ValueError(
                "Worksheet 'Base File' not found. Open the SLA master in Excel and ensure a sheet is named "
                f"exactly 'Base File'. Sheets in this file: {sheets}"
            ) from e
        
        # Clean column names (strip whitespace and handle duplicates)
        original_cols = [str(c).strip() for c in df.columns]
        df.columns = original_cols
        
        # 2. Identify Performance Columns
        # Month columns usually contain 'Score' or specific month names.
        # Format: 'Apr24 Score', 'Apr MET/NOT_MET', etc.
        score_cols = [c for c in df.columns if 'Score' in str(c)]
        print(f"Identified {len(score_cols)} performance snapshots.")

        # 3. Process Rows
        rows_processed = 0
        projects_created = 0
        metrics_cataloged = 0
        
        for index, row in df.iterrows():
            # Extract basic account metadata
            account_name = str(row.get('Project', '')).strip()
            perf_measure = str(row.get('Performance Measure', '')).strip()
            
            # Robust Sieve for header/instructional rows
            if not account_name or account_name.lower() in ['nan', 'sr.', 'project', 'metrics', '-']:
                continue
            if 'measure' in perf_measure.lower() or 'metric' in perf_measure.lower():
                continue
                
            # 3a. Sync Project (Account Level)
            project = db.query(Project).filter(Project.account_name == account_name).first()
            if not project:
                project = Project(
                    account_name=account_name,
                    filename=os.path.basename(file_path),
                    source_filename=os.path.basename(file_path)
                )
                db.add(project)
                db.flush() # Ensure ID is available
                projects_created += 1
            
            project.source_filename = os.path.basename(file_path)
            project.region = str(row.get('Region', ''))
            project.practice_head = str(row.get('Practice Head', ''))
            project.be_spoc = str(row.get('BE SPOC', ''))
            project.category = str(row.get('Category', ''))
            
            # 3b. Sync Metric Definition (The "Zero-Loss" Catalog)
            metric_label = str(row.get('Performance Measure', '')).strip()
            if not metric_label or metric_label == 'nan':
                continue
                
            # Check for existing definition for this account
            # (Compound key: project_id + label)
            m_def = db.query(MetricDefinition).filter(
                MetricDefinition.project_id == project.id,
                MetricDefinition.metric_label == metric_label
            ).first()
            
            if not m_def:
                m_def = MetricDefinition(
                    project_id=project.id, 
                    metric_label=metric_label,
                    source_filename=os.path.basename(file_path)
                )
                db.add(m_def)
                db.flush()
                metrics_cataloged += 1
            
            # Update source ref and metadata
            m_def.source_filename = os.path.basename(file_path)
            
            # Extract and store extensive metadata from first 15 columns
            m_def.metric_group = str(row.get('Metrics to be picked of BE Score (Measure Name as per standard Metrics)', ''))
            m_def.metric_nature = str(row.get('Metric Type', ''))
            m_def.target_threshold = str(row.get('Target', '')) # Note: some files may have multiple target cols, pandas handles as .1
            m_def.definition = str(row.get('Metric Definition', ''))
            m_def.calculation_method = str(row.get('Calculation Method', ''))
            m_def.source_system = str(row.get('Measurement System', ''))
            
            # 3c. Sync Time-Series Performance (Periodic scores)
            for s_col in score_cols:
                # Find corresponding status column (usually immediately following the score)
                s_idx = df.columns.get_loc(s_col)
                status_col = df.columns[s_idx + 1] if s_idx + 1 < len(df.columns) else None
                
                # Month key from header (e.g. "Apr24 Score" -> "Apr24")
                month_key = str(s_col).replace('Score', '').strip()
                period_date = parse_sla_score_column_name(s_col)
                
                raw_score = str(row.get(s_col, '')).strip()
                raw_status = str(row.get(status_col, '')).strip() if status_col else ''
                
                # Skip if empty
                if (not raw_score or raw_score == 'nan') and (not raw_status or raw_status == 'nan'):
                    continue
                
                # Upsert by calendar month when parsable (month-on-month analysis)
                if period_date:
                    canonical = canonical_month_label(period_date)
                    perf = db.query(SLAPerformance).filter(
                        SLAPerformance.definition_id == m_def.id,
                        SLAPerformance.period_start == period_date,
                    ).first()
                    if not perf:
                        perf = SLAPerformance(
                            definition_id=m_def.id,
                            period_start=period_date,
                            reporting_month=canonical,
                            source_filename=os.path.basename(file_path),
                        )
                        db.add(perf)
                    perf.period_start = period_date
                    perf.reporting_month = canonical
                else:
                    perf = db.query(SLAPerformance).filter(
                        SLAPerformance.definition_id == m_def.id,
                        SLAPerformance.period_start == None,
                        SLAPerformance.reporting_month == month_key,
                    ).first()
                    if not perf:
                        perf = SLAPerformance(
                            definition_id=m_def.id,
                            reporting_month=month_key,
                            source_filename=os.path.basename(file_path),
                        )
                        db.add(perf)
                
                # Update values and audit
                perf.source_filename = os.path.basename(file_path)
                perf.score = raw_score
                perf.rag_status = raw_status

            rows_processed += 1
            if rows_processed % 10 == 0:
                print(f"Processed {rows_processed} entries...")

        # 4. Commit and Summarize
        db.commit()
        print("\n--- Ingestion Complete ---")
        print(f"New Accounts (Projects) added: {projects_created}")
        print(f"Metrics cataloged: {metrics_cataloged}")
        print(f"Unique Metric-Snapshots saved to time-series store.")
        
    except Exception as e:
        db.rollback()
        print(f"FATAL ERROR during ingestion: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        if not external_session:
            db.close()

if __name__ == "__main__":
    # Default file path from analysis
    DEFAULT_PATH = "/Users/arjun/Software/tgddata/excel_files_imp/Raw Data SLA Basefile.xlsx"
    
    # Allow command line override
    target_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    
    ingest_sla(target_file)
