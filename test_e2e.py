import pandas as pd
import os
import json
import traceback
import time
from backend.db.database import SessionLocal, Project, Record, init_db
from backend.agents.sheet_identifier import SheetIdentifierAgent
from backend.agents.column_mapper import ColumnMapperAgent
from backend.agents.logic_generator import LogicGeneratorAgent
from backend.core.processor import ExcelProcessor

# --- 0. Setup ---
init_db()
db = SessionLocal()
excel_dir = "/Users/arjun/Software/tgddata/excel_files"

# Testing specifically on AMNS
files_to_test = [
    "Honeywell Trackers.xlsx"
]

for filename in files_to_test:
    excel_file = os.path.join(excel_dir, filename)
    if not os.path.exists(excel_file):
        continue
        
    print(f"\n{'='*20} PROCESSING: {filename} {'='*20}")
    
    try:
        # --- 1. Identify Sheets ---
        agent_id = SheetIdentifierAgent()
        xl = pd.ExcelFile(excel_file)
        classification = agent_id.identify_sheets(xl.sheet_names)
        print(f"✅ Sheets: Tracker='{classification.tracker_sheet}', Contract='{classification.contract_sheet}'")

        time.sleep(3) # Wait for rate limits

        # --- 2. Map Columns ---
        df_tracker = pd.read_excel(excel_file, sheet_name=classification.tracker_sheet)
        headers = list(df_tracker.columns)
        sample_rows = df_tracker.head(10).to_dict(orient='records')

        agent_map = ColumnMapperAgent()
        mapping_result = agent_map.map_columns(headers, sample_rows)
        print(f"✅ Mapping: Found {len(mapping_result.mapping)} universal keys")

        time.sleep(3) # Wait for rate limits

        # --- 3. Generate Logic ---
        df_contract = pd.read_excel(excel_file, sheet_name=classification.contract_sheet)
        contract_text = df_contract.to_string()

        agent_logic = LogicGeneratorAgent()
        logic_result = agent_logic.generate_logic(contract_text, headers, sample_rows)
        print(f"✅ Logic: {logic_result.explanation[:100]}...")

        time.sleep(3) # Wait for rate limits

        # Create/Update project in DB
        project = db.query(Project).filter(Project.filename == filename).first()
        if not project:
            project = Project(filename=filename)
            db.add(project)
        
        project.tracker_sheet = classification.tracker_sheet
        project.contract_sheet = classification.contract_sheet
        project.column_mapping = mapping_result.mapping
        project.revenue_logic_code = logic_result.python_code
        db.commit()
        db.refresh(project)

        # --- 4. Process and Store ---
        loc = {}
        exec(logic_result.python_code, globals(), loc)
        calc_func = loc['calculate']

        processor = ExcelProcessor(db)
        # Clear existing records for this project for clean test
        db.query(Record).filter(Record.project_id == project.id).delete()
        
        print(f"⌛ Processing {len(df_tracker)} rows...")
        processor.process_file_into_db(project.id, excel_file, classification.tracker_sheet, mapping_result.mapping, calc_func)

        # --- 5. Summary ---
        recs = db.query(Record).filter(Record.project_id == project.id).all()
        total_rev = sum(r.revenue_results.get('revenue', 0) for r in recs)
        joined_count = sum(1 for r in recs if r.status.lower() in ['joined', 'filled', 'hired', 'joined '])
        
        print(f"📊 RESULT: Total Revenue: {total_rev:,.2f} | Rows: {len(recs)} | Joinees: {joined_count}")

    except Exception as e:
        print(f"❌ FAILED {filename}: {str(e)}")
        # traceback.print_exc()

db.close()
