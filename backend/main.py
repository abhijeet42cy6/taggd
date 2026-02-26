import os
import shutil
import tempfile
import time
import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any

from .db.database import SessionLocal, Project, Record, init_db
from .agents.sheet_identifier import SheetIdentifierAgent
from .agents.column_mapper import ColumnMapperAgent
from .agents.logic_generator import LogicGeneratorAgent
from .core.processor import ExcelProcessor

# Initialize DB
init_db()

app = FastAPI(title="Agentic Revenue Generator API")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Agentic Revenue Generator API is running"}

@app.post("/upload")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 1. Save file locally
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Create Project entry
        project = db.query(Project).filter(Project.filename == file.filename).first()
        if not project:
            project = Project(filename=file.filename)
            db.add(project)
            db.commit()
            db.refresh(project)
        
        # Start the Agentic Pipeline
        # Step 1: Identify Sheets
        identity_agent = SheetIdentifierAgent()
        xl = pd.ExcelFile(file_path)
        sheets = xl.sheet_names
        classification = identity_agent.identify_sheets(sheets)
        
        project.tracker_sheet = classification.tracker_sheet
        project.contract_sheet = classification.contract_sheet
        db.commit()

        # Step 2: Map Columns
        time.sleep(3) # Rate limit guard
        df_tracker = pd.read_excel(file_path, sheet_name=classification.tracker_sheet)
        headers = list(df_tracker.columns)
        sample_rows = df_tracker.head(10).to_dict(orient='records')
        
        mapper_agent = ColumnMapperAgent()
        mapping_result = mapper_agent.map_columns(headers, sample_rows)
        project.column_mapping = mapping_result.mapping
        db.commit()

        # Step 3: Logic Synthesis
        time.sleep(3) # Rate limit guard
        df_contract = pd.read_excel(file_path, sheet_name=classification.contract_sheet)
        contract_text = df_contract.to_string()
        
        logic_agent = LogicGeneratorAgent()
        logic_result = logic_agent.generate_logic(contract_text, headers, sample_rows)
        project.revenue_logic_code = logic_result.python_code
        project.logic_explanation = logic_result.explanation
        db.commit()

        # Step 4: Process Records
        loc = {}
        try:
            exec(logic_result.python_code, globals(), loc)
            calc_func = loc['calculate']
        except Exception as e:
            raise Exception(f"Failed to execute synthesized code: {str(e)}")
        
        processor = ExcelProcessor(db)
        # Clear old records for this file
        db.query(Record).filter(Record.project_id == project.id).delete()
        db.commit()
        
        processor.process_file_into_db(
            project.id, 
            file_path, 
            classification.tracker_sheet, 
            mapping_result.mapping, 
            calc_func
        )

        return {
            "status": "success",
            "project_id": project.id,
            "sheets": {"tracker": classification.tracker_sheet, "contract": classification.contract_sheet},
            "mapping": mapping_result.mapping,
            "logic_explanation": logic_result.explanation,
            "python_code": logic_result.python_code,
            "headers_found": headers
        }

    except Exception as e:
        import traceback
        error_detail = f"Error during {project.filename} processing: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()

@app.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.get("/projects/{project_id}/records")
def get_records(project_id: int, db: Session = Depends(get_db)):
    records = db.query(Record).filter(Record.project_id == project_id).all()
    
    import math
    import datetime
    def clean_dict(data):
        if isinstance(data, dict):
            return {k: clean_dict(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [clean_dict(v) for v in data]
        elif isinstance(data, float):
            if math.isnan(data) or math.isinf(data):
                return None
            return data
        elif isinstance(data, (datetime.datetime, datetime.date)):
            return data.isoformat()
        return data

    res = []
    for r in records:
        d = r.__dict__.copy()
        if "_sa_instance_state" in d:
            del d["_sa_instance_state"]
        res.append(clean_dict(d))
    
    return res

@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Delete all child records first, then the project
    db.query(Record).filter(Record.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    return {"status": "deleted", "project_id": project_id}

@app.get("/stats/global")
def get_global_stats(db: Session = Depends(get_db)):
    records = db.query(Record).all()
    total_rev = 0
    total_opening = 0
    total_closing = 0
    joined_count = 0
    
    for r in records:
        res = r.revenue_results or {}
        total_rev += float(res.get('revenue') or 0)
        total_opening += float(res.get('opening_fee') or 0)
        total_closing += float(res.get('closing_fee') or 0)
        
        # Simple heuristic for joinees if not explicitly in result status
        if r.status and r.status.lower() in ['joined', 'filled', 'hired', 'joined ']:
            joined_count += 1
            
    return {
        "total_revenue": total_rev,
        "total_opening_fees": total_opening,
        "total_closing_fees": total_closing,
        "total_joinees": joined_count,
        "total_records": len(records),
        "total_projects": db.query(Project).count()
    }

@app.get("/stats/drilldown")
def get_drilldown_stats(field: str = "hiring_manager", db: Session = Depends(get_db)):
    # Group by manager or location
    if field not in ["hiring_manager", "location", "department"]:
        field = "hiring_manager"
        
    records = db.query(Record).all()
    data = {}
    
    for r in records:
        key = getattr(r, field) or "Unknown"
        if key not in data:
            data[key] = {"revenue": 0, "count": 0}
        
        res = r.revenue_results or {}
        data[key]["revenue"] += float(res.get('revenue') or 0)
        data[key]["count"] += 1
        
    # Format for charts
    chart_data = [{"name": k, "revenue": v["revenue"], "count": v["count"]} for k, v in data.items()]
    chart_data = sorted(chart_data, key=lambda x: x["revenue"], reverse=True)[:10] # Top 10
    
    return chart_data
