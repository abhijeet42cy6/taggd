import pandas as pd
import os
from backend.db.database import SessionLocal, Project, Record, init_db
from backend.agents.sheet_identifier import SheetIdentifierAgent
from backend.agents.column_mapper import ColumnMapperAgent
from backend.agents.logic_generator import LogicGeneratorAgent
from backend.core.processor import ExcelProcessor

def debug():
    init_db()
    db = SessionLocal()
    excel_file = "/Users/arjun/Software/tgddata/excel_files/Sterling (1).xlsx"
    
    if not os.path.exists(excel_file):
        print("File not found")
        return

    print(f"Checking {excel_file}")
    xl = pd.ExcelFile(excel_file)
    print(f"Sheets found: {xl.sheet_names}")
    
    identity_agent = SheetIdentifierAgent()
    classification = identity_agent.identify_sheets(xl.sheet_names)
    print(f"Classification: {classification}")
    
    df_tracker = pd.read_excel(excel_file, sheet_name=classification.tracker_sheet)
    print(f"Tracker Headers: {list(df_tracker.columns)}")
    print(f"First 5 rows: \n{df_tracker.head(5)}")
    
    headers = list(df_tracker.columns)
    sample_rows = df_tracker.head(10).to_dict(orient='records')
    
    mapper_agent = ColumnMapperAgent()
    mapping_result = mapper_agent.map_columns(headers, sample_rows)
    print(f"Mapping: {mapping_result.mapping}")
    
    # Check if candidate_name is mapped
    if 'candidate_name' not in mapping_result.mapping:
        print("❌ CRITICAL: 'candidate_name' NOT MAPPED.")
    else:
        target_col = mapping_result.mapping['candidate_name']
        print(f"Target column for candidate_name: {target_col}")
        # Check values in that column
        vals = df_tracker[target_col].dropna().unique()
        print(f"Unique candidate name values (subset): {vals[:5]}")
        if len(vals) == 0:
            print("❌ 'candidate_name' column is EMPTY.")

    db.close()

if __name__ == "__main__":
    debug()
