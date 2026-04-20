import os
import shutil
import tempfile
import time
import uuid
import datetime
import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, BackgroundTasks, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, not_
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from .db.database import (
    SessionLocal,
    Client,
    Project,
    Record,
    MetricDefinition,
    SLAPerformance,
    WFMHRBenchmark,
    WFMResourceGap,
    FinanceMonthlyLedger,
    FinanceCashFlow,
    FinanceEfficiencyKPI,
    User,
    UserProjectAssignment,
    init_db,
    get_db,
    ensure_project_client,
)
from .scripts.ingest_sla import ingest_sla
from .scripts.ingest_wfm import ingest_wfm_master
from .scripts.ingest_finance import ingest_finance_master
from .agents.sheet_identifier import SheetIdentifierAgent
from .agents.column_mapper import ColumnMapperAgent
from .agents.logic_generator import LogicGeneratorAgent
from .agents.matchmaker import MatchmakerAgent
from .core.processor import ExcelProcessor
from .core.ingestion_audit import log_ingestion_event, list_ingestion_events_for_user
from .core.activity_log import activity_log_to_dict, list_activity_for_user, log_activity
from .core.column_mapping_normalize import build_column_mapping_v2
from .core.record_field_synonyms import merge_llm_and_heuristic_record_fields
from .core.project_head_resolution import assigned_project_heads_by_project, resolve_project_head_label
from .core.budget_forecast_ledger import (
    ingest_budget_forecast_workbook,
    update_budget_quarters,
    update_forecast_metrics,
    recalculate_budget_forecast_links,
    build_budget_forecast_data_payload,
    waterfall_from_ledger,
    comparison_timeline,
)

# Initialize DB
init_db()

# Valid `records.source_joiner_type` values (requisition manual create / PATCH).
RECORD_SOURCE_JOINER_TYPES = frozenset(
    {
        "taggd_rpo",
        "taggd_direct",
        "nontaggd_employee_referral",
        "nontaggd_internal_job_portal",
        "nontaggd_campus",
        "nontaggd_transferred",
    }
)


def finalize_ingest_column_mapping(mapping_result, headers: list) -> dict:
    """Universal + RPO `record_fields`, merged LLM + heuristic; persisted as column_mapping v2."""
    rf = merge_llm_and_heuristic_record_fields(
        mapping_result.record_field_mapping,
        headers,
        mapping_result.mapping,
    )
    return build_column_mapping_v2(mapping_result.mapping, rf)

app = FastAPI(title="Agentic Revenue Generator API")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from .auth.middleware import AuthMiddleware
from .auth.client_write_guard import ClientWriteGuardMiddleware
from .auth.client_vertical_read_guard import ClientVerticalReadGuardMiddleware
from .auth.routes import router as auth_router
from .admin.routes import router as admin_router

# Stack (last added runs first on request): Auth → CORS → ClientWriteGuard → ClientVerticalReadGuard → routes.
app.add_middleware(ClientVerticalReadGuardMiddleware)
app.add_middleware(ClientWriteGuardMiddleware)
app.add_middleware(AuthMiddleware)
app.include_router(auth_router)
app.include_router(admin_router)

from .routers.sla_metrics import router as sla_metrics_write_router
from .routers.finance_ledger import router as finance_ledger_router
from .routers.wfm_benchmark import router as wfm_benchmark_router
from .routers.revenue_trackers import router as revenue_trackers_router
from .routers.revenue_weekly_submission import router as revenue_weekly_submission_router
from .routers.revenue_billing import router as revenue_billing_router
from .routers.candidates import router as candidates_router
from .routers.candidate_masters import router as candidate_masters_router
from .routers.project_contracts import router as project_contracts_router
from .routers.meetings import router as meetings_router
from .routers.resume_supplier_licenses import router as resume_supplier_licenses_router
from .routers.tasks import router as tasks_router
from .routers.transitions import router as transitions_router
from .routers.finance_billing_workflow import router as finance_billing_workflow_router

app.include_router(sla_metrics_write_router)
app.include_router(finance_ledger_router)
app.include_router(wfm_benchmark_router)
app.include_router(revenue_trackers_router)
app.include_router(revenue_weekly_submission_router)
app.include_router(revenue_billing_router)
app.include_router(candidates_router)
app.include_router(candidate_masters_router)
app.include_router(project_contracts_router)
app.include_router(meetings_router)
app.include_router(resume_supplier_licenses_router)
app.include_router(tasks_router)
app.include_router(transitions_router)
app.include_router(finance_billing_workflow_router)

from .auth.deps import get_current_user, allowed_project_ids, can_create_unmatched_project
from .auth.scope import (
    apply_project_scope,
    apply_recruiter_record_scope,
    assert_project_access,
    assert_client_access,
    account_accessible,
    scoped_clause_record,
)

# Dependency to get DB session — re-exported from database.get_db
class LogicRegenerateBody(BaseModel):
    dry_run: bool = False


class ProjectLogicUpdate(BaseModel):
    revenue_logic_code: str
    logic_explanation: str
    source_filename: Optional[str] = None
    contract_sheet: Optional[str] = None
    tracker_sheet: Optional[str] = None
    filename: Optional[str] = None


class ProjectMetadataPatch(BaseModel):
    """Partial update for enterprise fields on projects (directory / charge code sheet)."""
    charge_code: Optional[str] = None
    account_name: Optional[str] = None
    client_id: Optional[int] = None
    engagement_name: Optional[str] = None
    account_status: Optional[str] = None
    region: Optional[str] = None
    sub_region: Optional[str] = None
    function_head: Optional[str] = None
    regional_head: Optional[str] = None
    practice_head: Optional[str] = None
    project_head: Optional[str] = None
    project_head_user_id: Optional[int] = None
    be_spoc: Optional[str] = None
    category: Optional[str] = None
    vertical: Optional[str] = None
    practice: Optional[str] = None
    # Client > BU > SBU: BU has no parent; SBU parent_project_id → BU in same legal client.
    parent_project_id: Optional[int] = None
    org_unit_kind: Optional[str] = None
    hierarchy_tag_bu: Optional[str] = None
    hierarchy_tag_sbu: Optional[str] = None
    hierarchy_tag_sbg: Optional[str] = None
    hierarchy_tag_sbe: Optional[str] = None


ORG_UNIT_BUSINESS = "business_unit"
ORG_UNIT_SBU = "sub_business_unit"


def _hierarchy_tag_val(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    t = str(raw).strip()
    return t[:255] if t else None


def _validate_project_parent(db: Session, project: Project, new_parent_id: Optional[int]) -> None:
    """Ensure parent is same-client BU and does not create a cycle."""
    if new_parent_id is None:
        return
    if new_parent_id == project.id:
        raise HTTPException(status_code=400, detail="Project cannot be its own parent")
    parent = db.query(Project).filter(Project.id == new_parent_id).first()
    if not parent:
        raise HTTPException(status_code=400, detail="parent_project_id not found")
    if project.client_id != parent.client_id:
        raise HTTPException(status_code=400, detail="Parent project must belong to the same legal client")
    pok = (parent.org_unit_kind or ORG_UNIT_SBU).strip().lower()
    if pok != ORG_UNIT_BUSINESS:
        raise HTTPException(
            status_code=400,
            detail="Parent must be a business unit (set its org_unit_kind to business_unit first)",
        )
    cur: Optional[int] = new_parent_id
    for _ in range(128):
        if cur is None:
            break
        if cur == project.id:
            raise HTTPException(status_code=400, detail="Cannot set parent: would create a cycle")
        ap = db.query(Project).filter(Project.id == cur).first()
        if not ap:
            break
        cur = ap.parent_project_id


class ClientCreateBody(BaseModel):
    official_name: str
    short_code: Optional[str] = None
    lifecycle_state: Optional[str] = "active"
    hierarchy_tag_bu: Optional[str] = None
    hierarchy_tag_sbu: Optional[str] = None
    hierarchy_tag_sbg: Optional[str] = None
    hierarchy_tag_sbe: Optional[str] = None


class ClientPatchBody(BaseModel):
    official_name: Optional[str] = None
    short_code: Optional[str] = None
    lifecycle_state: Optional[str] = None
    hierarchy_tag_bu: Optional[str] = None
    hierarchy_tag_sbu: Optional[str] = None
    hierarchy_tag_sbg: Optional[str] = None
    hierarchy_tag_sbe: Optional[str] = None


class ClientProjectCreateBody(BaseModel):
    """Create an empty directory project under a legal client (no Excel ingest)."""

    engagement_name: str
    account_name: Optional[str] = None
    org_unit_kind: Optional[str] = None
    parent_project_id: Optional[int] = None
    project_head_user_id: Optional[int] = None
    practice_head: Optional[str] = None
    project_head: Optional[str] = None
    hierarchy_tag_bu: Optional[str] = None
    hierarchy_tag_sbu: Optional[str] = None
    hierarchy_tag_sbg: Optional[str] = None
    hierarchy_tag_sbe: Optional[str] = None


def _serialize_record_row(r: Record, today: datetime.datetime) -> dict:
    """Single-record JSON shape aligned with GET /records/all rows."""
    import math

    def clean(data):
        if isinstance(data, dict):
            return {k: clean(v) for k, v in data.items()}
        if isinstance(data, list):
            return [clean(v) for v in data]
        if isinstance(data, float) and (math.isnan(data) or math.isinf(data)):
            return None
        if isinstance(data, (datetime.datetime, datetime.date)):
            return data.isoformat()
        return data

    d = r.__dict__.copy()
    d.pop("_sa_instance_state", None)
    req_status = "Cancelled"
    if r.joining_date:
        req_status = "JOINED" if r.joining_date < today else "Yet to Join"
    d["req_status"] = req_status
    d["ageing"] = (today - r.creation_date).days if r.creation_date else None
    return clean(d)


def _parse_optional_datetime(val: Optional[str]) -> Optional[datetime.datetime]:
    if val is None:
        return None
    if isinstance(val, str) and not str(val).strip():
        return None
    s = str(val).strip()
    try:
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            daypart = s[:10]
            rest = s[10:].lstrip()
            if not rest:
                return datetime.datetime.fromisoformat(daypart + "T00:00:00")
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date or datetime: {val!r}")


class RecordRpoPatch(BaseModel):
    """Partial update for RPO Requisition Tracker fields on `records`."""

    client_req_id: Optional[str] = None
    rpo_client_name: Optional[str] = None
    positions_open: Optional[int] = None
    rpo_priority: Optional[str] = None
    rpo_job_type: Optional[str] = None
    experience_years_required: Optional[str] = None
    ctc_budget_lpa: Optional[float] = None
    rpo_source_of_hire: Optional[str] = None
    rpo_sub_source: Optional[str] = None
    profiles_sourced: Optional[int] = None
    profiles_submitted: Optional[int] = None
    interviews_scheduled: Optional[int] = None
    offers_released: Optional[int] = None
    offers_accepted: Optional[int] = None
    assigned_recruiter_rpo: Optional[str] = None
    rpo_mandate_status: Optional[str] = None
    rpo_vertical: Optional[str] = None
    rpo_division: Optional[str] = None
    rpo_bu_sbu: Optional[str] = None
    rpo_zone: Optional[str] = None
    rpo_grade_band: Optional[str] = None
    rpo_business_hrbp: Optional[str] = None
    rpo_sourcer: Optional[str] = None
    rpo_taggd_pm: Optional[str] = None
    rpo_hiring_agency: Optional[str] = None
    rpo_ijp_referral: Optional[str] = None
    mandate_received_date: Optional[str] = None
    intake_date: Optional[str] = None
    first_cv_share_date: Optional[str] = None
    selection_date_req: Optional[str] = None
    loi_date_req: Optional[str] = None
    closure_date_req: Optional[str] = None
    rpo_stage: Optional[str] = None
    ageing_days: Optional[int] = None
    ageing_bracket: Optional[str] = None
    dead_days: Optional[int] = None
    tto_days: Optional[int] = None
    ttf_days: Optional[int] = None
    taggd_fees_amount: Optional[float] = None
    billing_month: Optional[str] = None
    fy_label: Optional[str] = None
    requisition_extras: Optional[Dict[str, Any]] = None


_RECORD_RPO_DATE_FIELDS = frozenset(
    {
        "mandate_received_date",
        "intake_date",
        "first_cv_share_date",
        "selection_date_req",
        "loi_date_req",
        "closure_date_req",
    }
)
_RECORD_RPO_INT_FIELDS = frozenset(
    {
        "positions_open",
        "profiles_sourced",
        "profiles_submitted",
        "interviews_scheduled",
        "offers_released",
        "offers_accepted",
        "ageing_days",
        "dead_days",
        "tto_days",
        "ttf_days",
    }
)
_RECORD_RPO_FLOAT_FIELDS = frozenset({"ctc_budget_lpa", "taggd_fees_amount"})


def _apply_record_rpo_patch(r: Record, rpo: RecordRpoPatch) -> None:
    data = rpo.model_dump(exclude_unset=True)
    ext = data.pop("requisition_extras", None)
    for k, v in data.items():
        if v is None:
            continue
        if k in _RECORD_RPO_DATE_FIELDS:
            setattr(r, k, _parse_optional_datetime(str(v)))
        elif k in _RECORD_RPO_INT_FIELDS:
            setattr(r, k, int(v))
        elif k in _RECORD_RPO_FLOAT_FIELDS:
            setattr(r, k, float(v))
        elif isinstance(v, str):
            setattr(r, k, v.strip() or None)
        else:
            setattr(r, k, v)
    if ext is not None:
        if not isinstance(ext, dict):
            raise HTTPException(status_code=400, detail="requisition_extras must be an object")
        base = dict(r.requisition_extras) if isinstance(r.requisition_extras, dict) else {}
        r.requisition_extras = {**base, **ext}


class RecordPatch(BaseModel):
    status: Optional[str] = None
    global_status: Optional[str] = None
    candidate_name: Optional[str] = None
    position_title: Optional[str] = None
    source_joiner_type: Optional[str] = None
    hiring_manager: Optional[str] = None
    hiring_manager_user_id: Optional[int] = None
    assigned_recruiter_user_id: Optional[int] = None
    department: Optional[str] = None
    location: Optional[str] = None
    offered_ctc: Optional[float] = None
    creation_date: Optional[str] = None
    joining_date: Optional[str] = None
    additional_attributes: Optional[Dict[str, Any]] = None
    rpo: Optional[RecordRpoPatch] = None


class RecordCreate(BaseModel):
    """Manual requisition row (e.g. from UI). Not tied to an Excel row."""

    project_id: int
    candidate_name: str
    position_title: str
    source_joiner_type: str
    position_code: Optional[str] = None
    status: Optional[str] = "Open"
    global_status: Optional[str] = "ACTIVE"
    hiring_manager: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    offered_ctc: Optional[float] = None
    creation_date: Optional[str] = None
    joining_date: Optional[str] = None
    additional_attributes: Optional[Dict[str, Any]] = None
    client_req_id: Optional[str] = None
    rpo: Optional[RecordRpoPatch] = None


class ProConfirmRequest(BaseModel):
    project_id: int
    data_sheets: List[str]
    contract_sheet: str

@app.get("/")
def read_root():
    return {"message": "Agentic Revenue Generator API is running"}


@app.get("/ingestion/events")
def get_ingestion_events(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Legacy ingestion-shaped feed (backed by activity_log ingestion rows)."""
    from fastapi.responses import JSONResponse

    rows = list_ingestion_events_for_user(db, user, limit=limit)
    return JSONResponse(content={"events": rows})


@app.get("/activity/log")
def get_activity_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10_000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unified activity: requisitions, KPI edits, uploads, etc.

    Recruiters (and other scoped roles without project rows) see only rows they authored (`user_id`).
    """
    from fastapi.responses import JSONResponse

    rows, total = list_activity_for_user(db, user, limit=limit, offset=offset)
    return JSONResponse(
        content={
            "items": [activity_log_to_dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    )


@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = None
    # 1. Save file locally — unique name + basename only (avoid overwrite / path tricks)
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "upload.xlsx") or "upload.xlsx"
    file_path = os.path.join(temp_dir, f"express_{int(time.time())}_{safe_name}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Extract Clean Account Name from filename using Matchmaker intelligence
        from .agents.matchmaker import MatchmakerAgent
        matcher = MatchmakerAgent()
        # Create a single-item match request (managers only see assigned projects for matching)
        all_projects = apply_project_scope(db.query(Project), user, db, Project).all()
        db_projects_list = [{"id": p.id, "account_name": p.account_name, "filename": p.filename} for p in all_projects]
        
        match_result = matcher.match_clients([safe_name], db_projects_list)
        matched_id = match_result.matches[0].matched_project_id if match_result.matches else None
        
        if matched_id:
            project = db.query(Project).filter(Project.id == matched_id).first()
            if project:
                print(
                    f"INFO: Auto-linking {safe_name} to existing Project ID {matched_id} ({project.account_name})"
                )
        else:
            # Fallback to filename search if no clear entity match
            project = apply_project_scope(db.query(Project), user, db, Project).filter(Project.filename == safe_name).first()
            
        if not project:
            if not can_create_unmatched_project(user):
                raise HTTPException(status_code=403, detail="Cannot create a new project; contact an administrator.")
            # If still not found, create a new one but try to suggest an account name
            project = Project(filename=safe_name)
            # Quick name extraction for the new project
            suggested_match = matcher.match_clients([safe_name], []) # No DB projects to match, just extract
            if suggested_match.matches:
                project.account_name = suggested_match.matches[0].excel_name # Placeholder for name
            db.add(project)
            db.flush()
            ensure_project_client(db, project)
            db.commit()
            db.refresh(project)
        else:
            assert_project_access(user, db, project.id)
        
        # Ensure account name is set if we just created it or if it was missing
        if not project.account_name:
            # Final attempt to set account name from filename
            project.account_name = safe_name.split(".")[0].replace("_", " ").replace("-", " ")
            db.commit()
        
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
        column_mapping_payload = finalize_ingest_column_mapping(mapping_result, headers)
        project.column_mapping = column_mapping_payload

        # Identify the pos_id_column (e.g. Req ID, Job ID, etc.) for deduplication
        pos_id_col = None
        id_keywords = ['req', 'job id', 'job code', 'position id', 'id', 'sl no']
        for h in headers:
            if any(k in h.lower() for k in id_keywords):
                pos_id_col = h
                break
        
        # Fallback to Position Title if no ID found
        project.pos_id_column = pos_id_col or mapping_result.mapping.get("position_title") or headers[0]
        db.commit()

        # Step 3: Logic Synthesis
        time.sleep(3) # Rate limit guard        # --- LOGIC PINNING: Reuse existing logic if present ---
        if project.revenue_logic_code:
            print(f"INFO: Using Pinned Logic for Project {project.id}")
            logic_code = project.revenue_logic_code
            logic_explanation = project.logic_explanation
        else:
            print(f"INFO: Synthesizing New Logic for Project {project.id}")
            df_contract = pd.read_excel(file_path, sheet_name=classification.contract_sheet)
            contract_text = df_contract.to_string()
            
            logic_agent = LogicGeneratorAgent()
            logic_res = logic_agent.generate_logic(contract_text, headers, sample_rows)
            project.revenue_logic_code = logic_res.python_code
            project.logic_explanation = logic_res.explanation
            db.commit()
            logic_code = logic_res.python_code
            logic_explanation = logic_res.explanation

        # Step 4: Process Records
        loc = {}
        try:
            exec(logic_code, globals(), loc)
            calc_func = loc['calculate']
        except Exception as e:
            raise Exception(f"Failed to execute synthesized code: {str(e)}")
        
        processor = ExcelProcessor(db)
        
        processor.process_file_into_db(
            project.id,
            file_path,
            classification.tracker_sheet,
            column_mapping_payload,
            calc_func,
        )

        log_ingestion_event(
            db,
            user=user,
            kind="express",
            filename=safe_name,
            status="success",
            label="Complete",
            project_id=project.id,
        )
        return {
            "status": "success",
            "project_id": project.id,
            "sheets": {"tracker": classification.tracker_sheet, "contract": classification.contract_sheet},
            "mapping": column_mapping_payload,
            "logic_explanation": logic_explanation,
            "python_code": logic_code,
            "headers_found": headers
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        label = getattr(project, "filename", None) if project else safe_name
        error_detail = f"Error during {label} processing: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        log_ingestion_event(
            db,
            user=user,
            kind="express",
            filename=safe_name,
            status="error",
            label="Failed",
            project_id=project.id if project else None,
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload/pro/inspect")
async def pro_inspect_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Step 1: Save and categorize all sheets for Pro Upload path."""
    project = None
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "upload.xlsx") or "upload.xlsx"
    file_path = os.path.join(temp_dir, f"pro_{int(time.time())}_{safe_name}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        xl = pd.ExcelFile(file_path)
        all_sheets = xl.sheet_names
        
        identity_agent = SheetIdentifierAgent()
        classification = identity_agent.identify_sheets(all_sheets)
        
        # Use Matchmaker logic to identify if this file belongs to an existing account
        from .agents.matchmaker import MatchmakerAgent
        matcher = MatchmakerAgent()
        all_projects = apply_project_scope(db.query(Project), user, db, Project).all()
        db_projects_list = [{"id": p.id, "account_name": p.account_name, "filename": p.filename} for p in all_projects]
        
        match_result = matcher.match_clients([safe_name], db_projects_list)
        matched_id = match_result.matches[0].matched_project_id if match_result.matches else None
        
        if matched_id:
            project = db.query(Project).filter(Project.id == matched_id).first()
            print(f"INFO: Pro-Path linking {safe_name} to existing Project ID {matched_id}")
            if project:
                assert_project_access(user, db, project.id)
        else:
            if not can_create_unmatched_project(user):
                raise HTTPException(status_code=403, detail="Cannot create a new project; contact an administrator.")
            project = Project(filename=safe_name)
            db.add(project)
            db.flush()
            ensure_project_client(db, project)
            db.commit()
            db.refresh(project)

        # Store the temp path in logic_explanation temporarily for the next step
        project.logic_explanation = file_path # Internal marker
        project.source_filename = file_path # Store source file path for regeneration
        db.commit()

        log_ingestion_event(
            db,
            user=user,
            kind="pro_inspect",
            filename=safe_name,
            status="success",
            label="Needs review",
            project_id=project.id,
        )
        return {
            "status": "success",
            "project_id": project.id,
            "filename": safe_name,
            "all_sheets": all_sheets,
            "suggested": {
                "data_sheets": classification.data_sheets,
                "contract_sheet": classification.contract_sheet,
                "reasoning": classification.reasoning
            }
        }
    except Exception as e:
        log_ingestion_event(
            db,
            user=user,
            kind="pro_inspect",
            filename=safe_name,
            status="error",
            label="Failed",
            project_id=project.id if project else None,
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload/pro/confirm")
async def pro_confirm_upload(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Step 2: Run the full engine based on user-confirmed sheets."""
    project = None
    try:
        body = await request.json()
        
        project_id = body.get("project_id")
        data_sheets = body.get("data_sheets")
        contract_sheet = body.get("contract_sheet")
        
        if not all([project_id, data_sheets, contract_sheet]):
            raise HTTPException(status_code=400, detail=f"Missing required fields. Received: {list(body.keys())}")
            
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        assert_project_access(user, db, project_id)

        file_path = project.logic_explanation  # Recovered from inspect step
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail="Temporary file lost. Please re-upload.")

        # 1. Global Header Scan & Multi-Sheet Sampling
        all_headers = []
        all_samples = []
        unique_headers = set()
        
        for s in data_sheets:
            try:
                df_s = pd.read_excel(file_path, sheet_name=s)
                # Aggregate unique headers across all sheets
                for h in df_s.columns:
                    if h not in unique_headers:
                        unique_headers.add(h)
                        all_headers.append(h)
                
                # Take 5 random samples from each sheet to show semantic variance
                if len(df_s) > 0:
                    sample_size = min(5, len(df_s))
                    sheet_samples = df_s.sample(n=sample_size).to_dict(orient='records')
                    all_samples.extend(sheet_samples)
            except Exception as e:
                print(f"Warning: Could not sample sheet {s}: {e}")

        mapper_agent = ColumnMapperAgent()
        mapping_result = mapper_agent.map_columns(all_headers, all_samples)
        column_mapping_payload = finalize_ingest_column_mapping(mapping_result, all_headers)
        project.column_mapping = column_mapping_payload

        # Identity Keyword search for pos_id (Unified for all sheets)
        pos_id_col = None
        id_keywords = ['req', 'job id', 'job code', 'position id', 'id', 'sl no', 'reference']
        for h in all_headers:
            if any(k in h.lower() for k in id_keywords):
                pos_id_col = h
                break
        
        project.pos_id_column = pos_id_col or mapping_result.mapping.get("position_title") or all_headers[0]
        project.tracker_sheet = ",".join(data_sheets)
        project.contract_sheet = contract_sheet
        db.commit()

        # 2. Logic Synthesis
        # --- LOGIC PINNING: Reuse existing logic if present ---
        if project.revenue_logic_code:
            print(f"INFO: Using Pinned Logic for Project {project.id}")
            logic_code = project.revenue_logic_code
            logic_explanation = project.logic_explanation
        else:
            print(f"INFO: Synthesizing New Logic for Project {project.id}")
            df_contract = pd.read_excel(file_path, sheet_name=contract_sheet)
            contract_text = df_contract.to_string()
            
            logic_agent = LogicGeneratorAgent()
            logic_res = logic_agent.generate_logic(contract_text, all_headers, all_samples)
            project.revenue_logic_code = logic_res.python_code
            project.logic_explanation = logic_res.explanation # Overwrite internal path with real explanation
            db.commit()
            logic_code = logic_res.python_code
            logic_explanation = logic_res.explanation

        # 3. Process Records (Multi-Sheet)
        loc = {}
        exec(logic_code, globals(), loc)
        calc_func = loc['calculate']
        
        processor = ExcelProcessor(db)
        processor.process_file_into_db(project.id, file_path, data_sheets, column_mapping_payload, calc_func)

        log_ingestion_event(
            db,
            user=user,
            kind="pro_confirm",
            filename=project.filename or "workbook",
            status="success",
            label="Complete",
            project_id=project.id,
        )
        return {
            "status": "success",
            "project_id": project.id,
            "data_sheets": data_sheets,
            "logic_explanation": logic_explanation,
            "mapping": column_mapping_payload
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        log_ingestion_event(
            db,
            user=user,
            kind="pro_confirm",
            filename=(project.filename or "") if project else "",
            status="error",
            label="Failed",
            project_id=project.id if project else None,
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/projects/{project_id}/recalculate")
def recalculate_project_ledger(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The 'Backfill Pulse': Re-runs CURRENT logic on ALL existing records."""
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.revenue_logic_code:
        raise HTTPException(status_code=400, detail="Cannot recalculate: Missing logic for this project.")

    # 1. Prepare Logic
    loc = {}
    try:
        exec(project.revenue_logic_code, globals(), loc)
        calc_func = loc['calculate']
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logic Execution Error: {str(e)}")

    # 2. Pulse: Iterate and Update
    records = db.query(Record).filter(Record.project_id == project_id).all()
    count = 0
    
    from .core.processor import _derive_global_status, _sanitize_value
    
    for r in records:
        # Reconstruct row_dict from standard columns + additional_attributes
        row_dict = {**r.additional_attributes}
        # Inject standard columns that might be needed by the logic
        row_dict['Candidate Name'] = r.candidate_name
        row_dict['Position Title'] = r.position_title
        row_dict['Status'] = r.status
        row_dict['Offered CTC'] = r.offered_ctc
        row_dict['Location'] = r.location
        
        try:
            calc_results = calc_func(row_dict)
            if isinstance(calc_results, dict):
                calc_results = {k: _sanitize_value(v) for k, v in calc_results.items()}
            
            r.revenue_results = calc_results
            r.global_status = _derive_global_status(calc_results)
            count += 1
        except Exception:
            continue
            
    db.commit()
    return {"status": "success", "recalculated_records": count}


@app.post("/projects/{project_id}/logic/regenerate")
async def regenerate_project_logic(
    project_id: int,
    body: LogicRegenerateBody = LogicRegenerateBody(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Re-analyze the contract with AI. Use dry_run=true to preview without saving."""
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.source_filename:
        raise HTTPException(status_code=400, detail="Insufficient metadata for logic regeneration.")

    file_path = project.source_filename
    if not os.path.exists(file_path):
        common_paths = [f"./excel_files/{os.path.basename(file_path)}", f"./vault/{os.path.basename(file_path)}"]
        found = False
        for p in common_paths:
            if os.path.exists(p):
                file_path = p
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Source contract file missing from vault. Cannot regenerate logic.")

    try:
        df_contract = pd.read_excel(file_path, sheet_name=project.contract_sheet)
        contract_text = df_contract.to_string()

        data_sheets = project.tracker_sheet.split(",")
        df_sample = pd.read_excel(file_path, sheet_name=data_sheets[0])
        headers = df_sample.columns.tolist()
        samples = df_sample.head(5).to_dict(orient="records")

        logic_agent = LogicGeneratorAgent()
        logic_res = logic_agent.generate_logic(contract_text, headers, samples)

        if body.dry_run:
            return {
                "status": "preview",
                "dry_run": True,
                "new_explanation": logic_res.explanation,
                "new_python_code": logic_res.python_code,
            }

        project.revenue_logic_code = logic_res.python_code
        project.logic_explanation = logic_res.explanation
        db.commit()

        return {
            "status": "success",
            "dry_run": False,
            "new_explanation": logic_res.explanation,
            "new_python_code": logic_res.python_code,
            "is_pinned": True,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regeneration Failed: {str(e)}")


def _excel_files_dir() -> str:
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "excel_files"))
    os.makedirs(base, exist_ok=True)
    return base


def _safe_regen_filename(project_id: int, original: str) -> str:
    base = os.path.basename(original) or "upload.xlsx"
    base = "".join(c for c in base if c.isalnum() or c in "._- ")
    if not base or len(base) > 180:
        base = f"upload_{project_id}.xlsx"
    return f"prj{project_id}_regen_{int(time.time())}_{base}"


@app.post("/projects/{project_id}/logic/regenerate-from-upload")
async def regenerate_logic_from_upload(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Save uploaded workbook, re-identify contract vs tracker sheets (same agent as ingestion),
    synthesize revenue logic, return preview + server path to persist on apply.
    """
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    original_filename = file.filename or "upload.xlsx"
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in (".xlsx", ".xlsm", ".xls"):
        raise HTTPException(status_code=400, detail="Upload an Excel file (.xlsx, .xlsm, or .xls)")

    dest_name = _safe_regen_filename(project_id, original_filename)
    file_path = os.path.abspath(os.path.join(_excel_files_dir(), dest_name))

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    try:
        xl = pd.ExcelFile(file_path)
        sheet_names = xl.sheet_names
        if not sheet_names:
            raise HTTPException(status_code=400, detail="Workbook has no sheets")

        identity_agent = SheetIdentifierAgent()
        classification = identity_agent.identify_sheets(sheet_names)

        contract_sheet = classification.contract_sheet
        if contract_sheet not in sheet_names:
            for s in sheet_names:
                if s.strip().lower() == (contract_sheet or "").strip().lower():
                    contract_sheet = s
                    break
            if contract_sheet not in sheet_names:
                raise HTTPException(
                    status_code=400,
                    detail=f"Contract sheet '{classification.contract_sheet}' not found in workbook.",
                )

        data_sheets = classification.data_sheets if classification.data_sheets else [classification.tracker_sheet]
        data_sheets = [s for s in data_sheets if s in sheet_names]
        if not data_sheets:
            if classification.tracker_sheet in sheet_names:
                data_sheets = [classification.tracker_sheet]
            else:
                raise HTTPException(status_code=400, detail="No tracker/data sheet identified in workbook.")

        tracker_sheet_str = ",".join(data_sheets)
        first_tracker = data_sheets[0].strip()

        df_contract = pd.read_excel(file_path, sheet_name=contract_sheet)
        contract_text = df_contract.to_string()

        df_sample = pd.read_excel(file_path, sheet_name=first_tracker)
        headers = df_sample.columns.tolist()
        samples = df_sample.head(5).to_dict(orient="records")

        logic_agent = LogicGeneratorAgent()
        logic_res = logic_agent.generate_logic(contract_text, headers, samples)

        return {
            "status": "preview",
            "new_explanation": logic_res.explanation,
            "new_python_code": logic_res.python_code,
            "saved_path": file_path,
            "contract_sheet": contract_sheet,
            "tracker_sheet": tracker_sheet_str,
            "data_sheets": data_sheets,
            "sheet_reasoning": classification.reasoning,
            "sheet_confidence": classification.confidence,
            "original_filename": original_filename,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regeneration from upload failed: {str(e)}")


@app.put("/projects/{project_id}/logic")
def update_project_logic(
    project_id: int,
    body: ProjectLogicUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist revenue logic (e.g. after preview) and optionally recalculate separately."""
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.revenue_logic_code = body.revenue_logic_code
    project.logic_explanation = body.logic_explanation
    if body.source_filename is not None:
        project.source_filename = body.source_filename
    if body.contract_sheet is not None:
        project.contract_sheet = body.contract_sheet
    if body.tracker_sheet is not None:
        project.tracker_sheet = body.tracker_sheet
    if body.filename is not None:
        project.filename = body.filename
    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="project_logic",
        summary=f"Revenue logic updated (PRJ-{project_id})",
        project_id=project_id,
        resource_id=str(project_id),
    )
    return {"status": "success"}


@app.patch("/projects/{project_id}")
def patch_project_metadata(
    project_id: int,
    body: ProjectMetadataPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update directory metadata fields; omit keys you do not want to change."""
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:  # Pydantic v1
        data = body.dict(exclude_unset=True)
    if data.get("client_id") is not None:
        c = db.query(Client).filter(Client.id == data["client_id"]).first()
        if not c:
            raise HTTPException(status_code=400, detail="client_id does not exist")
    if data.get("project_head_user_id") is not None:
        uid = data["project_head_user_id"]
        if not db.query(User).filter(User.id == uid, User.is_active.is_(True)).first():
            raise HTTPException(status_code=400, detail=f"Invalid or inactive user id: {uid}")
    if "org_unit_kind" in data and data["org_unit_kind"] is not None:
        ok = str(data["org_unit_kind"]).strip().lower()
        if ok not in ("", ORG_UNIT_BUSINESS, ORG_UNIT_SBU):
            raise HTTPException(
                status_code=400,
                detail=f"org_unit_kind must be {ORG_UNIT_BUSINESS!r} or {ORG_UNIT_SBU!r}",
            )
        data["org_unit_kind"] = ok or None
    if data.get("org_unit_kind") == ORG_UNIT_BUSINESS:
        data["parent_project_id"] = None
    elif "parent_project_id" in data:
        _validate_project_parent(db, project, data["parent_project_id"])
    for key, val in data.items():
        if hasattr(project, key):
            setattr(project, key, val)
    db.commit()
    db.refresh(project)
    keys = ", ".join(sorted(data.keys())[:12])
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="project",
        summary=f"Project metadata updated (PRJ-{project_id}): {keys}",
        project_id=project_id,
        resource_id=str(project_id),
        meta={"fields": list(data.keys())},
    )
    return project


@app.post("/projects/metadata/upload")
async def upload_project_metadata_master(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Excel upload: rows matched by New Charge Code and/or Group Name to existing projects."""
    from .scripts.ingest_project_master import ingest_project_master_file

    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "project_master.xlsx") or "project_master.xlsx"
    file_path = os.path.join(temp_dir, f"projmeta_{int(time.time())}_{safe_name}")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        result = ingest_project_master_file(file_path, db)
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    finally:
        try:
            os.remove(file_path)
        except OSError:
            pass


@app.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from fastapi.responses import JSONResponse
    import math
    from sqlalchemy.orm import joinedload

    projects = (
        apply_project_scope(db.query(Project).options(joinedload(Project.client)), user, db, Project)
        .all()
    )

    def clean(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    dirty = False
    for p in projects:
        if p.client_id is None:
            ensure_project_client(db, p)
            dirty = True
    if dirty:
        db.commit()

    res = []
    for p in projects:
        d = {c.name: clean(getattr(p, c.name)) for c in p.__table__.columns}
        if p.client_id and p.client:
            d["client_official_name"] = p.client.official_name
        else:
            d["client_official_name"] = None
        res.append(d)

    return JSONResponse(
        content=res,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.post("/clients")
def create_client(
    body: ClientCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a parent client row (e.g. TATA) to attach SBU projects via PATCH /projects/{id}."""
    name = (body.official_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="official_name is required")
    ls = (body.lifecycle_state or "active").strip().lower()
    if ls not in ("active", "prospect"):
        raise HTTPException(status_code=400, detail="lifecycle_state must be active or prospect")
    c = Client(
        official_name=name[:500],
        short_code=(body.short_code or "").strip() or None,
        lifecycle_state=ls,
        hierarchy_tag_bu=_hierarchy_tag_val(body.hierarchy_tag_bu),
        hierarchy_tag_sbu=_hierarchy_tag_val(body.hierarchy_tag_sbu),
        hierarchy_tag_sbg=_hierarchy_tag_val(body.hierarchy_tag_sbg),
        hierarchy_tag_sbe=_hierarchy_tag_val(body.hierarchy_tag_sbe),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="client",
        summary=f"Client created: {c.official_name}",
        project_id=None,
        resource_id=str(c.id),
        meta={"official_name": c.official_name},
    )
    return {
        "id": c.id,
        "official_name": c.official_name,
        "short_code": c.short_code,
        "lifecycle_state": c.lifecycle_state,
        "hierarchy_tag_bu": getattr(c, "hierarchy_tag_bu", None),
        "hierarchy_tag_sbu": getattr(c, "hierarchy_tag_sbu", None),
        "hierarchy_tag_sbg": getattr(c, "hierarchy_tag_sbg", None),
        "hierarchy_tag_sbe": getattr(c, "hierarchy_tag_sbe", None),
    }


@app.get("/clients")
def list_clients_grouped(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clients the user can see, with scoped project rows under each."""
    from sqlalchemy.orm import joinedload
    import math

    projects = (
        apply_project_scope(db.query(Project).options(joinedload(Project.client)), user, db, Project)
        .order_by(Project.id)
        .all()
    )

    def clean(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    dirty = False
    for p in projects:
        if p.client_id is None:
            ensure_project_client(db, p)
            dirty = True
    if dirty:
        db.commit()

    by_c: Dict[int, Dict[str, Any]] = {}
    for p in projects:
        cid = p.client_id
        if cid is None:
            continue
        if cid not in by_c:
            cl = p.client
            by_c[cid] = {
                "id": cid,
                "official_name": cl.official_name if cl else "",
                "short_code": cl.short_code if cl else None,
                "lifecycle_state": getattr(cl, "lifecycle_state", None) or "active",
                "hierarchy_tag_bu": getattr(cl, "hierarchy_tag_bu", None) if cl else None,
                "hierarchy_tag_sbu": getattr(cl, "hierarchy_tag_sbu", None) if cl else None,
                "hierarchy_tag_sbg": getattr(cl, "hierarchy_tag_sbg", None) if cl else None,
                "hierarchy_tag_sbe": getattr(cl, "hierarchy_tag_sbe", None) if cl else None,
                "projects": [],
            }
        d = {c.name: clean(getattr(p, c.name)) for c in p.__table__.columns}
        if p.client:
            d["client_official_name"] = p.client.official_name
        else:
            d["client_official_name"] = None
        by_c[cid]["projects"].append(d)
    rows = sorted(by_c.values(), key=lambda x: (x["official_name"] or "").lower())
    return rows


@app.get("/clients/{client_id}")
def get_client_detail(
    client_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_client_access(user, db, client_id)
    from sqlalchemy.orm import joinedload
    import math

    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")

    def clean(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    projects = (
        apply_project_scope(
            db.query(Project).options(joinedload(Project.client)).filter(Project.client_id == client_id),
            user,
            db,
            Project,
        )
        .order_by(Project.id)
        .all()
    )
    plist = []
    for p in projects:
        d = {col.name: clean(getattr(p, col.name)) for col in p.__table__.columns}
        d["client_official_name"] = c.official_name
        plist.append(d)
    return {
        "id": c.id,
        "official_name": c.official_name,
        "short_code": c.short_code,
        "lifecycle_state": getattr(c, "lifecycle_state", None) or "active",
        "hierarchy_tag_bu": getattr(c, "hierarchy_tag_bu", None),
        "hierarchy_tag_sbu": getattr(c, "hierarchy_tag_sbu", None),
        "hierarchy_tag_sbg": getattr(c, "hierarchy_tag_sbg", None),
        "hierarchy_tag_sbe": getattr(c, "hierarchy_tag_sbe", None),
        "projects": plist,
    }


@app.patch("/clients/{client_id}")
def patch_client(
    client_id: int,
    body: ClientPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_client_access(user, db, client_id)
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    if "official_name" in data and data["official_name"] is not None:
        on = str(data["official_name"]).strip()
        if not on:
            raise HTTPException(status_code=400, detail="official_name cannot be empty")
        c.official_name = on[:500]
    if "short_code" in data:
        c.short_code = (str(data["short_code"]).strip() if data["short_code"] else None) or None
    if "lifecycle_state" in data and data["lifecycle_state"] is not None:
        ls = str(data["lifecycle_state"]).strip().lower()
        if ls not in ("active", "prospect"):
            raise HTTPException(status_code=400, detail="lifecycle_state must be active or prospect")
        c.lifecycle_state = ls
    for tag_key in ("hierarchy_tag_bu", "hierarchy_tag_sbu", "hierarchy_tag_sbg", "hierarchy_tag_sbe"):
        if tag_key in data:
            setattr(c, tag_key, _hierarchy_tag_val(data.get(tag_key)))
    db.commit()
    db.refresh(c)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="client",
        summary=f"Client updated (CLI-{client_id})",
        project_id=None,
        resource_id=str(client_id),
        meta={"fields": list(data.keys())},
    )
    return {
        "id": c.id,
        "official_name": c.official_name,
        "short_code": c.short_code,
        "lifecycle_state": c.lifecycle_state,
        "hierarchy_tag_bu": getattr(c, "hierarchy_tag_bu", None),
        "hierarchy_tag_sbu": getattr(c, "hierarchy_tag_sbu", None),
        "hierarchy_tag_sbg": getattr(c, "hierarchy_tag_sbg", None),
        "hierarchy_tag_sbe": getattr(c, "hierarchy_tag_sbe", None),
    }


def _upsert_user_project_assignment(db: Session, user_id: int, project_id: int) -> None:
    ex = (
        db.query(UserProjectAssignment)
        .filter(UserProjectAssignment.user_id == user_id, UserProjectAssignment.project_id == project_id)
        .first()
    )
    if not ex:
        db.add(UserProjectAssignment(user_id=user_id, project_id=project_id))


@app.post("/clients/{client_id}/projects")
def create_project_under_client(
    client_id: int,
    body: ClientProjectCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a directory-only project (PRJ) under a legal client; grants scoped creator + optional project head access."""
    assert_client_access(user, db, client_id)
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    en = (body.engagement_name or "").strip()
    if not en:
        raise HTTPException(status_code=400, detail="engagement_name is required")
    raw_kind = (body.org_unit_kind or ORG_UNIT_SBU or "").strip().lower()
    if raw_kind in ("", "sbu", "sub_business_unit"):
        org_kind = ORG_UNIT_SBU
    elif raw_kind in ("bu", "business", "business_unit"):
        org_kind = ORG_UNIT_BUSINESS
    else:
        org_kind = ORG_UNIT_SBU
    parent_id = body.parent_project_id
    if org_kind == ORG_UNIT_BUSINESS:
        parent_id = None
    acct = (body.account_name or "").strip() or en
    fn = f"dir:{client_id}:{uuid.uuid4().hex[:20]}"
    p = Project(
        filename=fn[:240],
        client_id=client_id,
        engagement_name=en[:500],
        account_name=acct[:500],
        org_unit_kind=org_kind,
        parent_project_id=parent_id,
        hierarchy_tag_bu=_hierarchy_tag_val(body.hierarchy_tag_bu),
        hierarchy_tag_sbu=_hierarchy_tag_val(body.hierarchy_tag_sbu),
        hierarchy_tag_sbg=_hierarchy_tag_val(body.hierarchy_tag_sbg),
        hierarchy_tag_sbe=_hierarchy_tag_val(body.hierarchy_tag_sbe),
        tracker_sheet="",
        contract_sheet="",
        source_filename="manual",
        uploaded_by=(user.email or str(user.id))[:200],
    )
    uid = body.project_head_user_id
    head_user: Optional[User] = None
    if uid is not None:
        head_user = db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
        if not head_user:
            raise HTTPException(status_code=400, detail=f"Invalid or inactive user id: {uid}")
        p.project_head_user_id = uid
        p.project_head = (head_user.email or str(uid))[:500]
    ph_in = (body.practice_head or "").strip()
    if ph_in:
        p.practice_head = ph_in[:500]
    elif head_user and (head_user.email or "").strip():
        p.practice_head = (head_user.email or "").strip()[:500]
    ph_label = (body.project_head or "").strip()
    if ph_label and not p.project_head:
        p.project_head = ph_label[:500]

    db.add(p)
    db.flush()
    if parent_id is not None:
        _validate_project_parent(db, p, parent_id)

    ids = allowed_project_ids(user, db)
    if ids is not None:
        _upsert_user_project_assignment(db, user.id, p.id)
    if uid is not None:
        _upsert_user_project_assignment(db, uid, p.id)

    db.commit()
    db.refresh(p)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="project",
        summary=f"Project created under CLI-{client_id}: {p.engagement_name}",
        project_id=p.id,
        resource_id=str(p.id),
        meta={"client_id": client_id, "engagement_name": p.engagement_name},
    )
    import math
    from sqlalchemy.orm import joinedload

    proj = db.query(Project).options(joinedload(Project.client)).filter(Project.id == p.id).first()

    def clean(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    d = {col.name: clean(getattr(proj, col.name)) for col in proj.__table__.columns}
    if proj.client_id and proj.client:
        d["client_official_name"] = proj.client.official_name
    else:
        d["client_official_name"] = None
    return d

@app.get("/projects/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import math
    from sqlalchemy.orm import joinedload

    assert_project_access(user, db, project_id)
    project = (
        db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    def clean(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            return v.isoformat()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    d = {c.name: clean(getattr(project, c.name)) for c in project.__table__.columns}
    if project.client_id and project.client:
        d["client_official_name"] = project.client.official_name
    else:
        d["client_official_name"] = None
    return d

@app.get("/projects/{project_id}/records")
def get_records(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    records = db.query(Record).filter(Record.project_id == project_id).all()
    
    import math
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

    today = datetime.datetime.utcnow()
    res = []
    for r in records:
        d = r.__dict__.copy()
        if "_sa_instance_state" in d:
            del d["_sa_instance_state"]
        
        # Calculate dynamic req_status
        req_status = "Cancelled"
        if r.joining_date:
            if r.joining_date < today:
                req_status = "JOINED"
            else:
                req_status = "Yet to Join"
        d["req_status"] = req_status
        
        # Calculate dynamic ageing (for non-closed positions)
        ageing = None
        if r.creation_date:
            ageing = (today - r.creation_date).days
        d["ageing"] = ageing
        
        res.append(clean_dict(d))
    
    return res

@app.get("/records/all")
def get_all_records(
    page: int = 1,
    per_page: int = 100,
    project_id: int = None,
    status: str = None,
    search: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Single paginated endpoint replacing the N+1 allRecords() waterfall.
    Returns all records in one query with optional filters.
    """
    import math
    from fastapi.responses import JSONResponse

    today = datetime.datetime.utcnow()
    q = db.query(Record)
    c = scoped_clause_record(user, db)
    if c is not None:
        q = q.filter(c)
    q = apply_recruiter_record_scope(q, user, db)

    if project_id:
        assert_project_access(user, db, project_id)
        q = q.filter(Record.project_id == project_id)
    if status:
        q = q.filter(Record.global_status == status.upper())
    if search:
        term = f"%{search}%"
        q = q.filter(
            Record.candidate_name.ilike(term)
            | Record.position_title.ilike(term)
            | Record.hiring_manager.ilike(term)
            | Record.department.ilike(term)
        )

    total = q.count()
    offset = (page - 1) * per_page
    records = q.order_by(Record.id.desc()).offset(offset).limit(per_page).all()

    res = [_serialize_record_row(r, today) for r in records]

    return JSONResponse(
        content={
            "records": res,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": math.ceil(total / per_page) if per_page else 1,
        },
        headers={"Cache-Control": "public, max-age=15, stale-while-revalidate=30"},
    )


@app.patch("/records/{record_id}")
def patch_record(
    record_id: int,
    body: RecordPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Partial update for a requisition row (scoped by project access)."""
    r = db.query(Record).filter(Record.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Record not found")
    assert_project_access(user, db, r.project_id)

    today = datetime.datetime.utcnow()
    patch = body.model_dump(exclude_unset=True)

    str_fields = (
        "status",
        "global_status",
        "candidate_name",
        "position_title",
        "hiring_manager",
        "department",
        "location",
    )
    for key in str_fields:
        if key not in patch:
            continue
        val = patch[key]
        setattr(r, key, (val.strip() if isinstance(val, str) else val) or None)

    if "source_joiner_type" in patch:
        raw_sj = patch["source_joiner_type"]
        if raw_sj is None:
            r.source_joiner_type = None
        else:
            sj = str(raw_sj).strip()
            if sj and sj not in RECORD_SOURCE_JOINER_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid source_joiner_type; expected one of: {sorted(RECORD_SOURCE_JOINER_TYPES)}",
                )
            r.source_joiner_type = sj or None

    def _validate_user_fk(uid: Optional[int]) -> None:
        if uid is None:
            return
        if not db.query(User).filter(User.id == uid, User.is_active.is_(True)).first():
            raise HTTPException(status_code=400, detail=f"Invalid or inactive user id: {uid}")

    if "hiring_manager_user_id" in patch:
        uid = patch["hiring_manager_user_id"]
        if uid is not None:
            _validate_user_fk(uid)
        r.hiring_manager_user_id = uid
    if "assigned_recruiter_user_id" in patch:
        uid = patch["assigned_recruiter_user_id"]
        if uid is not None:
            _validate_user_fk(uid)
        r.assigned_recruiter_user_id = uid

    if "offered_ctc" in patch:
        r.offered_ctc = patch["offered_ctc"]

    if "creation_date" in patch:
        r.creation_date = _parse_optional_datetime(patch["creation_date"])

    if "joining_date" in patch:
        r.joining_date = _parse_optional_datetime(patch["joining_date"])

    if "additional_attributes" in patch and patch["additional_attributes"] is not None:
        base = dict(r.additional_attributes) if isinstance(r.additional_attributes, dict) else {}
        incoming = patch["additional_attributes"]
        if not isinstance(incoming, dict):
            raise HTTPException(status_code=400, detail="additional_attributes must be an object")
        r.additional_attributes = {**base, **incoming}

    if body.rpo is not None:
        _apply_record_rpo_patch(r, body.rpo)

    db.commit()
    db.refresh(r)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="requisition",
        summary=f"Requisition #{record_id} updated — {(r.candidate_name or '')[:80]}",
        project_id=r.project_id,
        resource_id=str(record_id),
        meta={"fields": sorted(patch.keys())},
    )
    return _serialize_record_row(r, today)


@app.delete("/records/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a requisition row (scoped by project access)."""
    r = db.query(Record).filter(Record.id == record_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Record not found")
    assert_project_access(user, db, r.project_id)
    pid = r.project_id
    label = (r.candidate_name or "")[:80]
    db.delete(r)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="requisition",
        summary=f"Requisition #{record_id} deleted — {label}",
        project_id=pid,
        resource_id=str(record_id),
    )
    return {"status": "deleted", "id": record_id}


@app.post("/records")
def create_record(
    body: RecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a requisition record manually (scoped to project access)."""
    import uuid

    cand = (body.candidate_name or "").strip()
    pos = (body.position_title or "").strip()
    if not cand or not pos:
        raise HTTPException(status_code=400, detail="candidate_name and position_title are required")

    assert_project_access(user, db, body.project_id)
    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    sj = (body.source_joiner_type or "").strip()
    if not sj:
        raise HTTPException(status_code=400, detail="source_joiner_type is required (joiner source)")
    if sj not in RECORD_SOURCE_JOINER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_joiner_type; expected one of: {sorted(RECORD_SOURCE_JOINER_TYPES)}",
        )

    today = datetime.datetime.utcnow()
    creation_dt = _parse_optional_datetime(body.creation_date) or today
    joining_dt = _parse_optional_datetime(body.joining_date)

    attrs: Dict[str, Any] = {}
    if isinstance(body.additional_attributes, dict):
        attrs = {**body.additional_attributes}
    pc = (body.position_code or "").strip()
    if pc:
        attrs["position_code"] = pc

    fp = f"manual:{body.project_id}:{uuid.uuid4().hex}"

    r = Record(
        project_id=body.project_id,
        candidate_name=cand,
        position_title=pos,
        status=(body.status or "Open").strip() or "Open",
        global_status=(body.global_status or "ACTIVE").strip() or "ACTIVE",
        hiring_manager=(body.hiring_manager or "").strip() or None,
        department=(body.department or "").strip() or None,
        location=(body.location or "").strip() or None,
        offered_ctc=body.offered_ctc,
        creation_date=creation_dt,
        joining_date=joining_dt,
        additional_attributes=attrs if attrs else None,
        revenue_results={},
        fingerprint=fp,
        excel_provided_id=pc or None,
        excel_row_index=-1,
        client_req_id=(body.client_req_id or "").strip() or None,
        source_joiner_type=sj,
    )
    if body.rpo is not None:
        _apply_record_rpo_patch(r, body.rpo)
    db.add(r)
    db.commit()
    db.refresh(r)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="requisition",
        summary=f"Requisition #{r.id} created — {cand[:80]}",
        project_id=body.project_id,
        resource_id=str(r.id),
    )
    return _serialize_record_row(r, today)


# ─── DATA OPERATIONS (Integrity / Risk) ───────────────────────────────────────

@app.get("/data-ops/summary")
def get_data_ops_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Data Operations: high-signal integrity metrics for trust & remediation.
    Intended for the frontend "Data Operations" tab.
    """
    from fastapi.responses import JSONResponse

    # Split identity at client level: same account_name appears in multiple Project rows
    projects = apply_project_scope(db.query(Project), user, db, Project).all()
    split_counts: dict[str, int] = {}
    for p in projects:
        if not p.account_name:
            continue
        split_counts[p.account_name] = split_counts.get(p.account_name, 0) + 1
    split_clients = [(name, c) for name, c in split_counts.items() if c > 1]

    # Revenue risk: CLOSED but revenue == 0 and closing_fee == 0
    revenue_json = func.coalesce(func.json_extract(Record.revenue_results, "$.revenue"), 0.0)
    closing_fee_json = func.coalesce(func.json_extract(Record.revenue_results, "$.closing_fee"), 0.0)
    revenue_risk_q = apply_project_scope(
        db.query(func.count(Record.id)), user, db, Record
    ).filter(
        Record.global_status == "CLOSED",
        revenue_json == 0.0,
        closing_fee_json == 0.0,
    )
    revenue_closed_zero_count = revenue_risk_q.scalar() or 0

    # Lifecycle risk: CLOSED but joining_date is missing
    missing_joining_count = (
        apply_project_scope(db.query(func.count(Record.id)), user, db, Record)
        .filter(
            Record.global_status == "CLOSED",
            Record.joining_date == None,  # noqa: E711
        )
        .scalar()
        or 0
    )

    # Placeholder identity risk: candidate_name is a synthetic REQ:// id
    placeholder_candidate_count = (
        apply_project_scope(db.query(func.count(Record.id)), user, db, Record)
        .filter(Record.candidate_name.like("REQ://%"))
        .scalar()
        or 0
    )

    # Missing critical fields
    missing_location_count = (
        apply_project_scope(db.query(func.count(Record.id)), user, db, Record)
        .filter(
            (Record.location == None) | (func.trim(Record.location) == ""),  # noqa: E711
        )
        .scalar()
        or 0
    )

    quality_score = 100
    quality_score -= min(60, int(len(split_clients)) * 6)
    quality_score -= min(30, int(revenue_closed_zero_count / 4000) * 10)
    quality_score -= min(40, int(missing_joining_count / 5000) * 10)
    quality_score -= min(20, int(placeholder_candidate_count / 50000) * 10)
    quality_score = max(0, quality_score)

    return JSONResponse(
        content={
            "quality_score": quality_score,
            "split_clients": split_clients,
            "revenue_closed_zero_count": int(revenue_closed_zero_count),
            "missing_joining_count": int(missing_joining_count),
            "placeholder_candidate_count": int(placeholder_candidate_count),
            "missing_location_count": int(missing_location_count),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/data-ops/risk/revenue-closed-zero/projects")
def get_revenue_risk_projects(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Projects with revenue risk: CLOSED but revenue==0 and closing_fee==0.
    Returns aggregated counts to drive remediation actions.
    """
    from fastapi.responses import JSONResponse
    revenue_json = func.coalesce(func.json_extract(Record.revenue_results, "$.revenue"), 0.0)
    closing_fee_json = func.coalesce(func.json_extract(Record.revenue_results, "$.closing_fee"), 0.0)

    q = apply_project_scope(
        db.query(
            Record.project_id,
            Project.account_name,
            func.count(Record.id).label("bad_count"),
        ),
        user,
        db,
        Record,
    )
    q = (
        q.join(Project, Project.id == Record.project_id)
        .filter(
            Record.global_status == "CLOSED",
            revenue_json == 0.0,
            closing_fee_json == 0.0,
        )
        .group_by(Record.project_id, Project.account_name)
        .order_by(func.count(Record.id).desc())
    )
    total = q.count() or 0
    offset = (page - 1) * per_page
    rows = q.offset(offset).limit(per_page).all()
    return JSONResponse(
        content={
            "projects": [
                {
                    "project_id": r[0],
                    "account_name": r[1] or f"Project-{r[0]}",
                    "bad_count": int(r[2]),
                }
                for r in rows
            ],
            "page": page,
            "per_page": per_page,
            "pages": (total // per_page) + (1 if total % per_page else 0),
            "total": int(total),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/data-ops/risk/revenue-closed-zero/records")
def get_revenue_risk_records(
    page: int = 1,
    per_page: int = 50,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Sample evidence rows: record-level revenue risk.
    """
    from fastapi.responses import JSONResponse
    revenue_json = func.coalesce(func.json_extract(Record.revenue_results, "$.revenue"), 0.0)
    closing_fee_json = func.coalesce(func.json_extract(Record.revenue_results, "$.closing_fee"), 0.0)
    opening_fee_json = func.coalesce(func.json_extract(Record.revenue_results, "$.opening_fee"), 0.0)

    q = apply_project_scope(
        db.query(
            Record.id,
            Record.project_id,
            Project.account_name,
            Record.candidate_name,
            Record.position_title,
            Record.hiring_manager,
            Record.department,
            Record.location,
            Record.excel_provided_id,
            Record.excel_row_index,
            opening_fee_json.label("opening_fee"),
            revenue_json.label("revenue"),
            closing_fee_json.label("closing_fee"),
        ),
        user,
        db,
        Record,
    )
    q = q.join(Project, Project.id == Record.project_id).filter(
        Record.global_status == "CLOSED",
        revenue_json == 0.0,
        closing_fee_json == 0.0,
    )
    if project_id is not None:
        assert_project_access(user, db, project_id)
        q = q.filter(Record.project_id == project_id)

    total = q.count()
    offset = (page - 1) * per_page
    rows = q.order_by(Record.id.desc()).offset(offset).limit(per_page).all()
    return JSONResponse(
        content={
            "records": [
                {
                    "id": r[0],
                    "project_id": r[1],
                    "account_name": r[2] or f"Project-{r[1]}",
                    "candidate_name": r[3],
                    "position_title": r[4],
                    "hiring_manager": r[5],
                    "department": r[6],
                    "location": r[7],
                    "excel_provided_id": r[8],
                    "excel_row_index": r[9],
                    "opening_fee": float(r[10] or 0.0),
                    "revenue": float(r[11] or 0.0),
                    "closing_fee": float(r[12] or 0.0),
                }
                for r in rows
            ],
            "page": page,
            "per_page": per_page,
            "pages": (total // per_page) + (1 if total % per_page else 0),
            "total": int(total),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/data-ops/risk/missing-joining-date/projects")
def get_missing_joining_projects(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Projects with lifecycle risk: CLOSED but missing joining_date.
    """
    from fastapi.responses import JSONResponse

    q = apply_project_scope(
        db.query(
            Record.project_id,
            Project.account_name,
            func.count(Record.id).label("bad_count"),
        ),
        user,
        db,
        Record,
    )
    q = (
        q.join(Project, Project.id == Record.project_id)
        .filter(
            Record.global_status == "CLOSED",
            Record.joining_date == None,  # noqa: E711
        )
        .group_by(Record.project_id, Project.account_name)
        .order_by(func.count(Record.id).desc())
    )
    total = q.count()
    offset = (page - 1) * per_page
    rows = q.offset(offset).limit(per_page).all()

    return JSONResponse(
        content={
            "projects": [
                {
                    "project_id": r[0],
                    "account_name": r[1] or f"Project-{r[0]}",
                    "bad_count": int(r[2]),
                }
                for r in rows
            ],
            "page": page,
            "per_page": per_page,
            "pages": (total // per_page) + (1 if total % per_page else 0),
            "total": int(total),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/data-ops/risk/missing-joining-date/records")
def get_missing_joining_records(
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Sample evidence rows: record-level lifecycle risk.
    """
    from fastapi.responses import JSONResponse

    q = apply_project_scope(
        db.query(
            Record.id,
            Record.project_id,
            Project.account_name,
            Record.candidate_name,
            Record.position_title,
            Record.hiring_manager,
            Record.department,
            Record.location,
            Record.excel_provided_id,
            Record.excel_row_index,
        ),
        user,
        db,
        Record,
    )
    q = (
        q.join(Project, Project.id == Record.project_id)
        .filter(
            Record.global_status == "CLOSED",
            Record.joining_date == None,  # noqa: E711
        )
    )

    total = q.count()
    offset = (page - 1) * per_page
    rows = q.order_by(Record.id.desc()).offset(offset).limit(per_page).all()

    return JSONResponse(
        content={
            "records": [
                {
                    "id": r[0],
                    "project_id": r[1],
                    "account_name": r[2] or f"Project-{r[1]}",
                    "candidate_name": r[3],
                    "position_title": r[4],
                    "hiring_manager": r[5],
                    "department": r[6],
                    "location": r[7],
                    "excel_provided_id": r[8],
                    "excel_row_index": r[9],
                }
                for r in rows
            ],
            "page": page,
            "per_page": per_page,
            "pages": (total // per_page) + (1 if total % per_page else 0),
            "total": int(total),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Delete all child records first, then the project
    db.query(Record).filter(Record.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="project",
        summary=f"Project deleted (PRJ-{project_id})",
        project_id=project_id,
        resource_id=str(project_id),
    )
    return {"status": "deleted", "project_id": project_id}

@app.get("/stats/global")
def get_global_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import case, cast, Float
    from fastapi.responses import JSONResponse

    # Pull only the JSON column — no ORM object inflation
    rq = db.query(Record.revenue_results, Record.global_status)
    c = scoped_clause_record(user, db)
    if c is not None:
        rq = rq.filter(c)
    rows = rq.all()

    total_rev = 0.0
    total_opening = 0.0
    total_closing = 0.0
    joined_count = 0

    for rev_results, g_status in rows:
        res = rev_results or {}
        total_rev     += float(res.get('revenue')     or 0)
        total_opening += float(res.get('opening_fee') or 0)
        total_closing += float(res.get('closing_fee') or 0)
        if g_status == "CLOSED":
            joined_count += 1

    total_records = len(rows)
    pq = db.query(func.count(Project.id))
    pq = apply_project_scope(pq, user, db, Project)
    total_projects = pq.scalar() or 0

    return JSONResponse(
        content={
            "total_revenue": total_rev,
            "total_opening_fees": total_opening,
            "total_closing_fees": total_closing,
            "total_joinees": joined_count,
            "total_records": total_records,
            "total_projects": total_projects,
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.get("/stats/global/monitor")
def get_global_monitoring(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The Command Center API: Normalized across all vaults.
    Uses SQL aggregates — no full table scan in Python.
    """
    from fastapi.responses import JSONResponse

    def _rec(q):
        return apply_project_scope(q, user, db, Record)

    today = datetime.datetime.utcnow()

    # ── 1. Status breakdown via GROUP BY ────────────────────────────────────
    status_rows = (
        _rec(db.query(Record.global_status, func.count(Record.id)))
        .group_by(Record.global_status)
        .all()
    )
    known = {"CLOSED", "ACTIVE", "PIPELINE", "ON HOLD"}
    status_counts = {"CLOSED": 0, "ACTIVE": 0, "PIPELINE": 0, "ON HOLD": 0, "UNPROCESSED": 0}
    for status, cnt in status_rows:
        if status in known:
            status_counts[status] += cnt
        else:
            status_counts["UNPROCESSED"] += cnt

    # ── 2. Total positions ──────────────────────────────────────────────────
    total_positions = _rec(db.query(func.count(Record.id))).scalar() or 0

    # ── 3. Joining date breakdown ───────────────────────────────────────────
    joined = (
        _rec(db.query(func.count(Record.id)))
        .filter(Record.joining_date != None, Record.joining_date < today)
        .scalar()
        or 0
    )
    yet_to_join = (
        _rec(db.query(func.count(Record.id)))
        .filter(Record.joining_date != None, Record.joining_date >= today)
        .scalar()
        or 0
    )
    cancelled = total_positions - joined - yet_to_join
    req_counts = {"JOINED": joined, "Yet to Join": yet_to_join, "Cancelled": cancelled}

    # ── 4. Ageing — only load (creation_date, global_status) columns ───────
    def _is_closed_for_ageing(gs: Optional[str]) -> bool:
        """Exclude terminal CLOSED rows from pipeline ageing (case/whitespace tolerant)."""
        if gs is None:
            return False
        return str(gs).strip().upper() == "CLOSED"

    ageing_rows = (
        _rec(db.query(Record.creation_date, Record.global_status))
        .filter(Record.creation_date != None)
        .all()
    )
    total_ageing = 0
    ageing_count = 0
    ageing_buckets = {"0-30 days": 0, "31-60 days": 0, "61-90 days": 0, "90+ days": 0}
    for cdate, gstatus in ageing_rows:
        if _is_closed_for_ageing(gstatus):
            continue
        days = (today - cdate).days
        if days < 0:
            continue
        total_ageing += days
        ageing_count += 1
        if days <= 30:   ageing_buckets["0-30 days"] += 1
        elif days <= 60: ageing_buckets["31-60 days"] += 1
        elif days <= 90: ageing_buckets["61-90 days"] += 1
        else:            ageing_buckets["90+ days"] += 1

    # ── 5. Revenue total — JSON column scan (minimal columns) ──────────────
    rev_rows = _rec(db.query(Record.revenue_results)).all()
    revenue_total = sum(float((r[0] or {}).get("revenue") or 0) for r in rev_rows)

    # ── 6. Per-project stats — two GROUP BY queries ─────────────────────────
    # 6a. Total + per-status counts in one pass
    proj_status_rows = (
        _rec(db.query(Record.project_id, Record.global_status, func.count(Record.id)))
        .group_by(Record.project_id, Record.global_status)
        .all()
    )
    proj_status: dict = {}  # pid → {status: count}
    proj_pos: dict = {}      # pid → total
    for pid, status, cnt in proj_status_rows:
        if pid not in proj_status:
            proj_status[pid] = {}
        proj_status[pid][status or "UNPROCESSED"] = cnt
        proj_pos[pid] = proj_pos.get(pid, 0) + cnt

    # 6b. Revenue per project
    proj_rev_rows = _rec(db.query(Record.project_id, Record.revenue_results)).all()
    proj_rev: dict = {}
    for pid, rr in proj_rev_rows:
        proj_rev[pid] = proj_rev.get(pid, 0.0) + float((rr or {}).get("revenue") or 0)

    projects = apply_project_scope(
        db.query(Project.id, Project.account_name, Project.filename),
        user,
        db,
        Project,
    ).all()

    project_stats = []
    for p in projects:
        total = proj_pos.get(p.id, 0)
        statuses = proj_status.get(p.id, {})
        closed   = statuses.get("CLOSED", 0)
        active   = statuses.get("ACTIVE", 0)
        on_hold  = statuses.get("ON HOLD", 0)
        pipeline = statuses.get("PIPELINE", 0)
        project_stats.append({
            "id": p.id,
            "name": p.account_name or p.filename,
            "positions": total,
            "closed": closed,
            "active": active,
            "on_hold": on_hold,
            "pipeline": pipeline,
            "revenue": round(proj_rev.get(p.id, 0.0), 2),
        })

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={
            "total_positions": total_positions,
            "status_breakdown": status_counts,
            "req_status_breakdown": req_counts,
            "ageing_summary": {
                "average_days": round(total_ageing / ageing_count, 1) if ageing_count > 0 else 0,
                "total_open_with_date": ageing_count,
                "buckets": ageing_buckets,
            },
            "revenue_total": round(revenue_total, 2),
            "project_stats": project_stats,
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.get("/stats/drilldown")
def get_drilldown_stats(
    field: str = "hiring_manager",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from fastapi.responses import JSONResponse

    if field not in ["hiring_manager", "location", "department"]:
        field = "hiring_manager"

    col = getattr(Record, field)
    # Only load the two columns we need
    rows = apply_project_scope(db.query(col, Record.revenue_results), user, db, Record).all()
    data: dict = {}
    for key_val, rr in rows:
        key = key_val or "Unknown"
        if key not in data:
            data[key] = {"revenue": 0.0, "count": 0}
        data[key]["revenue"] += float((rr or {}).get("revenue") or 0)
        data[key]["count"] += 1

    chart_data = [{"name": k, "revenue": v["revenue"], "count": v["count"]} for k, v in data.items()]
    chart_data = sorted(chart_data, key=lambda x: x["revenue"], reverse=True)[:10]

    return JSONResponse(
        content=chart_data,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/stats/requisitions/kpis")
def get_requisition_kpis(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Portfolio requisition counts from tracker `records` (aligned with hiring pipeline semantics).
    - open_req: ACTIVE rows without an offer-stage signal in raw status
    - offer_req: PIPELINE, or any non-closed row whose status text suggests Offer/Offered
    - joiners: CLOSED (normalized joiners / closed hires)
    """
    from fastapi.responses import JSONResponse

    st = func.lower(func.coalesce(Record.status, ""))
    offer_like = st.like("%offer%")

    def _rq():
        return apply_project_scope(db.query(func.count(Record.id)), user, db, Record)

    joiners = _rq().filter(Record.global_status == "CLOSED").scalar() or 0
    open_req = (
        _rq()
        .filter(Record.global_status == "ACTIVE", not_(offer_like))
        .scalar()
        or 0
    )
    offer_req = (
        _rq()
        .filter(
            Record.global_status != "CLOSED",
            or_(Record.global_status == "PIPELINE", offer_like),
        )
        .scalar()
        or 0
    )
    total_records = _rq().scalar() or 0

    return JSONResponse(
        content={
            "open_req": int(open_req),
            "offer_req": int(offer_req),
            "joiners": int(joiners),
            "total_records": int(total_records),
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.post("/api/upload/budget-forecast")
async def upload_budget_forecast(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ingest Budget and Forecast templates and link them to existing projects."""
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "budget.xlsx") or "budget.xlsx"
    file_path = os.path.join(temp_dir, f"bf_{int(time.time())}_{safe_name}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        xl = pd.ExcelFile(file_path)
        if "Budget Template" not in xl.sheet_names or "Forecast Template" not in xl.sheet_names:
            raise HTTPException(status_code=400, detail="Excel must contain 'Budget Template' and 'Forecast Template' sheets.")

        # 1. Matcher Phase
        df_budget = pd.read_excel(file_path, sheet_name="Budget Template")
        excel_names = df_budget["Project"].dropna().unique().tolist()
        
        all_projects = apply_project_scope(db.query(Project), user, db, Project).all()
        db_projects_list = [{"id": p.id, "filename": p.filename} for p in all_projects]
        
        matcher = MatchmakerAgent()
        match_list = matcher.match_clients(excel_names, db_projects_list)
        
        # Create a lookup map: Excel Name -> Project ID
        name_to_id = {m.excel_name: m.matched_project_id for m in match_list.matches if m.matched_project_id}
        scope_ids = allowed_project_ids(user, db)
        if scope_ids is not None:
            name_to_id = {k: v for k, v in name_to_id.items() if v in scope_ids}

        # Clear existing budget/forecast ONLY for the projects present in this upload
        df_forecast = pd.read_excel(file_path, sheet_name="Forecast Template")
        ingest_budget_forecast_workbook(
            db,
            df_budget=df_budget,
            df_forecast=df_forecast,
            name_to_id=name_to_id,
            safe_filename=safe_name,
        )
        log_activity(
            db,
            user=user,
            action="upload",
            resource_type="budget_forecast_upload",
            summary=f"Budget/forecast workbook uploaded — {safe_name} ({len(name_to_id)} clients)",
            project_id=None,
            meta={"filename": safe_name, "matched_clients": len(name_to_id)},
        )
        return {"status": "success", "matched_clients": len(name_to_id)}

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

class BudgetUpdate(BaseModel):
    q1: float
    q2: float
    q3: float
    q4: float

@app.put("/api/budget/{project_id}")
def update_budget(
    project_id: int,
    update: BudgetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    update_budget_quarters(
        db,
        project_id,
        update.q1,
        update.q2,
        update.q3,
        update.q4,
    )
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="budget",
        summary=f"Budget quarters updated (PRJ-{project_id})",
        project_id=project_id,
        resource_id=str(project_id),
    )
    return {"status": "success"}

class ForecastUpdate(BaseModel):
    mmf: float
    joiner: float
    joining_fee: float

@app.put("/api/forecast/{project_id}")
def update_forecast(
    project_id: int,
    update: ForecastUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_project_access(user, db, project_id)
    update_forecast_metrics(
        db,
        project_id,
        update.mmf,
        update.joiner,
        update.joining_fee,
    )
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="forecast",
        summary=f"Forecast metrics updated (PRJ-{project_id})",
        project_id=project_id,
        resource_id=str(project_id),
    )
    return {"status": "success"}

@app.get("/api/budget-forecast/data")
def get_budget_forecast_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retrieve detailed quarterly budget and monthly forecast data for all uploaded clients."""
    return build_budget_forecast_data_payload(db, allowed_project_ids(user, db))

@app.get("/api/budget-forecast/waterfall")
def get_waterfall_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Calculate MoM Bridge metrics (Opening -> Additions -> Closures -> Leakage).

    NOTE: The frontend currently uses `waterfall.total` as "Forecast Full-Yr".
    Previously, we calculated the bridge for *the current calendar month* which
    becomes 0 if the uploaded forecast FY window doesn't include that month.

    To make "Forecast Full-Yr" non-zero and consistent with uploaded FY data,
    we align the bridge to the uploaded MMF forecast window:
    - opening = MMF at the first forecast month
    - total    = sum(MMF) across the forecast window (treated as full-year forecast)
    - additions = total - opening
    - closures/leakage = 0 (kept for UI compatibility; proper MoM breakdown can be added later)
    """
    return waterfall_from_ledger(db, allowed_project_ids(user, db))

@app.post("/api/budget-forecast/recalculate")
def recalculate_planning(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fuzzy-link budget/forecast ledger rows (bf:* uploads) where project_id was unset."""
    projects = apply_project_scope(db.query(Project), user, db, Project).all()
    matched_count = recalculate_budget_forecast_links(db, projects)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="budget_forecast_recalculate",
        summary=f"Budget/forecast project links recalculated ({matched_count} rows matched)",
        project_id=None,
        meta={"matched": matched_count},
    )
    return {"status": "success", "matched": matched_count}

@app.get("/api/budget-forecast/comparison/{project_id}")
def get_project_comparison(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Monthly breakdown of Forecast vs Actual for a specific project."""
    assert_project_access(user, db, project_id)
    return comparison_timeline(db, project_id)

@app.get("/sla/timeseries")
async def get_sla_timeseries(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Per-account SLA compliance trend over chronological months.
    Uses period_start / canonical YYYY-MM when available for true month-to-month ordering.
    Returns: [ { account_name, timeline: [ { month, met, not_met, not_reported, met_pct, total } ] } ]
    """
    from fastapi.responses import JSONResponse

    from backend.core.sla_period import canonical_month_label, sort_key_for_month_label

    # Month labels that carry no real period information — skip entirely
    _GARBAGE = {
        "YTD",
        "Metrics to be picked of BE  (Measure Name as per standard Metrics)",
    }

    def _norm_rag(s: str) -> str:
        """Bucket raw rag_status into met / not_met / not_reported."""
        s = (s or "").strip().lower()
        if s == "met":
            return "met"
        if "not met" in s or s == "not met":
            return "not_met"
        # Everything else: nan, NA, Not Reported, Speed, Quality, etc.
        return "not_reported"

    # One row per metric snapshot — aggregate in Python so we can use period_start
    rows = (
        apply_project_scope(
            db.query(
                Project.account_name,
                SLAPerformance.period_start,
                SLAPerformance.reporting_month,
                SLAPerformance.rag_status,
            )
            .join(MetricDefinition, MetricDefinition.id == SLAPerformance.definition_id)
            .join(Project, Project.id == MetricDefinition.project_id),
            user,
            db,
            Project,
        )
        .all()
    )

    data: dict[str, dict[str, dict[str, int]]] = {}
    for account_name, period_start, reporting_month, rag_status in rows:
        account = (account_name or "Unknown").strip()
        month_s = (
            canonical_month_label(period_start)
            if period_start is not None
            else (reporting_month or "").strip()
        )
        if not month_s or month_s in _GARBAGE or "Metrics to be picked" in month_s:
            continue
        if account not in data:
            data[account] = {}
        if month_s not in data[account]:
            data[account][month_s] = {"met": 0, "not_met": 0, "not_reported": 0}
        data[account][month_s][_norm_rag(rag_status)] += 1

    # Build sorted output
    result = []
    for account in sorted(data.keys()):
        timeline = []
        for m in sorted(data[account].keys(), key=sort_key_for_month_label):
            d = data[account][m]
            total = d["met"] + d["not_met"]
            met_pct = round(d["met"] / total * 100, 1) if total > 0 else None
            timeline.append({
                "month": m,
                "met": d["met"],
                "not_met": d["not_met"],
                "not_reported": d["not_reported"],
                "met_pct": met_pct,
                "total": total,
            })
        if timeline:
            result.append({"account_name": account, "timeline": timeline})

    return JSONResponse(
        content=result,
        headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=120"},
    )


@app.get("/sla/stats")
async def get_sla_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Portfolio-wide SLA performance statistics — pure SQL aggregates."""
    from fastapi.responses import JSONResponse

    total_metrics = (
        apply_project_scope(db.query(func.count(MetricDefinition.id)), user, db, MetricDefinition).scalar() or 0
    )
    total_accounts = (
        apply_project_scope(db.query(func.count(Project.id)), user, db, Project)
        .filter(Project.account_name != None)
        .scalar()
        or 0
    )

    # RAG counts in one query
    rag_rows = (
        apply_project_scope(
            db.query(SLAPerformance.rag_status, func.count(SLAPerformance.id))
            .join(MetricDefinition, MetricDefinition.id == SLAPerformance.definition_id),
            user,
            db,
            MetricDefinition,
        )
        .group_by(SLAPerformance.rag_status)
        .all()
    )
    met_count = 0
    not_met_count = 0
    for rag, cnt in rag_rows:
        if rag == "Met":
            met_count += cnt
        elif rag in ("Not Met", "NOT MET"):
            not_met_count += cnt

    risky_metrics = (
        apply_project_scope(
            db.query(MetricDefinition.metric_label, func.count(SLAPerformance.id).label("failures"))
            .join(SLAPerformance)
            .filter(SLAPerformance.rag_status.in_(["Not Met", "NOT MET"])),
            user,
            db,
            MetricDefinition,
        )
        .group_by(MetricDefinition.metric_label)
        .order_by(func.count(SLAPerformance.id).desc())
        .limit(5)
        .all()
    )

    return JSONResponse(
        content={
            "total_accounts": total_accounts,
            "total_metrics": total_metrics,
            "portfolio_health": round((met_count / (met_count + not_met_count) * 100), 1) if (met_count + not_met_count) > 0 else 0,
            "met_count": met_count,
            "not_met_count": not_met_count,
            "systemic_risks": [{"metric": r[0], "count": r[1]} for r in risky_metrics],
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.get("/sla/data")
async def get_sla_details(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Full detail of all metrics and their latest performances.
    Uses joinedload to avoid N+1 queries.
    """
    from sqlalchemy.orm import joinedload, contains_eager
    from fastapi.responses import JSONResponse

    # Load all metrics with their project in 2 queries (not N+1)
    metrics = (
        apply_project_scope(
            db.query(MetricDefinition).options(joinedload(MetricDefinition.project)),
            user,
            db,
            MetricDefinition,
        ).all()
    )

    # Latest performance per definition: max calendar month (period_start), else max id
    def_ids = [m.id for m in metrics]
    all_perfs = (
        db.query(SLAPerformance).filter(SLAPerformance.definition_id.in_(def_ids)).all()
        if def_ids
        else []
    )
    perf_map: dict[int, SLAPerformance] = {}
    for p in all_perfs:
        cur = perf_map.get(p.definition_id)
        if cur is None:
            perf_map[p.definition_id] = p
            continue
        if p.period_start is not None and cur.period_start is not None:
            if p.period_start > cur.period_start:
                perf_map[p.definition_id] = p
        elif p.period_start is not None and cur.period_start is None:
            perf_map[p.definition_id] = p
        elif p.period_start is None and cur.period_start is None and p.id > cur.id:
            perf_map[p.definition_id] = p

    res = []
    for m in metrics:
        latest = perf_map.get(m.id)
        project = m.project
        ph = (project.practice_head or "").strip() if project else ""
        rh = (project.regional_head or "").strip() if project else ""
        mn = (m.metric_nature or "").strip() if m.metric_nature else ""
        res.append({
            "id": m.id,
            "project_id": m.project_id,
            "account_name": project.account_name if project else "Unknown",
            "region": project.region if project else "Unknown",
            "practice_head": ph or None,
            "regional_head": rh or None,
            "metric_nature": mn or None,
            "metric_label": m.metric_label,
            "metric_group": m.metric_group,
            "target": m.target_threshold,
            "latest_score": latest.score if latest else "N/A",
            "status": latest.rag_status if latest else "N/A",
            "reporting_month": str(latest.reporting_month) if latest and latest.reporting_month else "N/A",
            "period_start": latest.period_start.isoformat() if latest and latest.period_start else None,
            "definition": m.definition,
            "formula": m.formula,
            "calculation": m.calculation_method,
        })

    return JSONResponse(
        content=res,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )


@app.get("/sla/account-metrics-timeseries")
async def get_sla_account_metrics_timeseries(
    account: str = Query(..., description="Project account_name to drill down"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Per-metric monthly RAG for one account (for drilldown charts).
    Same month canonicalization and rag bucketing as GET /sla/timeseries.
    """
    from fastapi.responses import JSONResponse

    from backend.core.sla_period import canonical_month_label, sort_key_for_month_label

    _GARBAGE = {
        "YTD",
        "Metrics to be picked of BE  (Measure Name as per standard Metrics)",
    }

    def _norm_rag(s: str) -> str:
        s = (s or "").strip().lower()
        if s == "met":
            return "met"
        if "not met" in s or s == "not met":
            return "not_met"
        return "not_reported"

    want = (account or "").strip()
    if not want:
        raise HTTPException(status_code=400, detail="account is required")
    if not account_accessible(user, db, want):
        raise HTTPException(status_code=403, detail="Access denied for this account")

    rows = (
        apply_project_scope(
            db.query(
                MetricDefinition.id,
                MetricDefinition.metric_label,
                MetricDefinition.metric_nature,
                SLAPerformance.period_start,
                SLAPerformance.reporting_month,
                SLAPerformance.rag_status,
            )
            .join(SLAPerformance, SLAPerformance.definition_id == MetricDefinition.id)
            .join(Project, Project.id == MetricDefinition.project_id)
            .filter(Project.account_name == want),
            user,
            db,
            Project,
        )
        .all()
    )

    # definition_id -> month -> counts
    data: dict[int, dict[str, dict[str, int]]] = {}
    meta: dict[int, tuple[str, str | None]] = {}

    for def_id, metric_label, metric_nature, period_start, reporting_month, rag_status in rows:
        month_s = (
            canonical_month_label(period_start)
            if period_start is not None
            else (reporting_month or "").strip()
        )
        if not month_s or month_s in _GARBAGE or "Metrics to be picked" in month_s:
            continue
        if def_id not in data:
            data[def_id] = {}
            nature = (metric_nature or "").strip() or None
            meta[def_id] = (metric_label or "", nature)
        if month_s not in data[def_id]:
            data[def_id][month_s] = {"met": 0, "not_met": 0, "not_reported": 0}
        data[def_id][month_s][_norm_rag(rag_status)] += 1

    metrics_out = []
    for def_id in sorted(data.keys()):
        label, nature = meta.get(def_id, ("", None))
        timeline = []
        for m in sorted(data[def_id].keys(), key=sort_key_for_month_label):
            d = data[def_id][m]
            total = d["met"] + d["not_met"]
            met_pct = round(d["met"] / total * 100, 1) if total > 0 else None
            timeline.append({
                "month": m,
                "met": d["met"],
                "not_met": d["not_met"],
                "not_reported": d["not_reported"],
                "met_pct": met_pct,
                "total": total,
            })
        metrics_out.append({
            "definition_id": def_id,
            "metric_label": label,
            "metric_nature": nature,
            "timeline": timeline,
        })

    return JSONResponse(
        content={"account_name": want, "metrics": metrics_out},
        headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=120"},
    )


@app.post("/sla/upload")
async def upload_sla_master(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload and ingest a Master SLA Basefile."""
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "sla.xlsx") or "sla.xlsx"
    file_path = os.path.join(temp_dir, f"sla_master_{int(time.time())}_{safe_name}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Run the ingestion pipeline (using the imported script logic)
        ingest_sla(file_path, db=db)
        log_ingestion_event(
            db,
            user=user,
            kind="sla",
            filename=safe_name,
            status="success",
            label="Complete",
            project_id=None,
        )
        return {"status": "success", "message": "Master SLA file processed successfully."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        log_ingestion_event(
            db,
            user=user,
            kind="sla",
            filename=safe_name,
            status="error",
            label="Failed",
            project_id=None,
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/wfm/stats")
async def get_wfm_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Summary of Workforce Management — SQL aggregates only."""
    from fastapi.responses import JSONResponse

    agg = (
        apply_project_scope(
            db.query(
                func.sum(WFMHRBenchmark.ideal_hc).label("total_ideal"),
                func.sum(WFMHRBenchmark.actual_hc_total).label("total_actual"),
                func.sum(WFMHRBenchmark.wl1_hires).label("wl1"),
                func.sum(WFMHRBenchmark.wl2_hires).label("wl2"),
                func.sum(WFMHRBenchmark.wl3_hires).label("wl3"),
                func.sum(WFMHRBenchmark.wl4_hires).label("wl4"),
            ),
            user,
            db,
            WFMHRBenchmark,
        )
        .one()
    )

    total_ideal  = float(agg.total_ideal  or 0)
    total_actual = float(agg.total_actual or 0)
    open_reqs = (
        apply_project_scope(db.query(func.count(WFMResourceGap.id)), user, db, WFMResourceGap).scalar() or 0
    )

    return JSONResponse(
        content={
            "capacity_fill_rate": round((total_actual / total_ideal * 100), 1) if total_ideal > 0 else 0,
            "total_actual_hc": total_actual,
            "total_ideal_hc": total_ideal,
            "hc_gap": round(total_ideal - total_actual, 1),
            "wl_distribution": {
                "WL1": float(agg.wl1 or 0),
                "WL2": float(agg.wl2 or 0),
                "WL3": float(agg.wl3 or 0),
                "WL4": float(agg.wl4 or 0),
            },
            "open_requisitions": open_reqs,
        },
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.get("/wfm/data")
async def get_wfm_details(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Detailed WFM metrics per client account — joinedload to avoid N+1."""
    from sqlalchemy.orm import joinedload
    from fastapi.responses import JSONResponse

    benchmarks = (
        apply_project_scope(
            db.query(WFMHRBenchmark).options(joinedload(WFMHRBenchmark.project)),
            user,
            db,
            WFMHRBenchmark,
        ).all()
    )
    res = []
    for b in benchmarks:
        project = b.project
        res.append({
            "id": b.id,
            "project_id": b.project_id,
            "account_name": project.account_name if project else "Unknown",
            "region": project.region if project else "Unknown",
            "vertical": project.vertical if project else "N/A",
            "practice": project.practice if project else "N/A",
            "practice_head": (project.practice_head or "").strip() if project else "",
            "reporting_date": b.reporting_date.isoformat() if b.reporting_date else None,
            "ideal_hc": b.ideal_hc,
            "actual_hc_total": b.actual_hc_total,
            "lateral_revenue_target": b.lateral_revenue_target,
            "lateral_hc_target": b.lateral_hc_target,
            "lateral_productivity_target": b.lateral_productivity_target,
            "gap": round((b.ideal_hc or 0) - (b.actual_hc_total or 0), 1),
            "wl1_hires": b.wl1_hires,
            "wl2_hires": b.wl2_hires,
            "wl3_hires": b.wl3_hires,
            "wl4_hires": b.wl4_hires,
        })

    return JSONResponse(
        content=res,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.post("/wfm/upload")
async def upload_wfm_master(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload and ingest the Master WFM / Headcount Projection file."""
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "wfm.xlsx") or "wfm.xlsx"
    file_path = os.path.join(temp_dir, f"wfm_master_{int(time.time())}_{safe_name}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Run the WFM ingestion pipeline
        ingest_wfm_master(file_path)
        log_ingestion_event(
            db,
            user=user,
            kind="wfm",
            filename=safe_name,
            status="success",
            label="Complete",
            project_id=None,
        )
        return {"status": "success", "message": "WFM Master file processed successfully."}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        log_ingestion_event(
            db,
            user=user,
            kind="wfm",
            filename=safe_name,
            status="error",
            label="Failed",
            project_id=None,
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/finance/stats")
async def get_finance_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Portfolio-wide Financial Health summary."""
    from sqlalchemy import func

    # Sum per (project, month) using MAX to match merged ledger rows (no double-count if duplicates exist)
    rev_sub = (
        apply_project_scope(
            db.query(
                func.max(FinanceMonthlyLedger.actual_value).label("ma"),
                func.max(FinanceMonthlyLedger.budget_value).label("mb"),
            ),
            user,
            db,
            FinanceMonthlyLedger,
        )
        .filter(FinanceMonthlyLedger.metric_category == "Revenue")
        .group_by(FinanceMonthlyLedger.project_id, FinanceMonthlyLedger.reporting_month)
    ).subquery()
    total_rev_actual = db.query(func.coalesce(func.sum(rev_sub.c.ma), 0)).scalar() or 0
    total_rev_budget = db.query(func.coalesce(func.sum(rev_sub.c.mb), 0)).scalar() or 0

    cm_sub = (
        apply_project_scope(
            db.query(func.max(FinanceMonthlyLedger.actual_value).label("ma")),
            user,
            db,
            FinanceMonthlyLedger,
        )
        .filter(FinanceMonthlyLedger.metric_category == "Contribution Margin")
        .group_by(FinanceMonthlyLedger.project_id, FinanceMonthlyLedger.reporting_month)
    ).subquery()
    total_cm_actual = db.query(func.coalesce(func.sum(cm_sub.c.ma), 0)).scalar() or 0

    cf_sub = (
        apply_project_scope(
            db.query(
                func.max(FinanceCashFlow.unbilled_amount).label("mu"),
                func.max(FinanceCashFlow.actual_collected).label("mc"),
                func.max(FinanceCashFlow.bad_debt).label("mbd"),
                func.max(FinanceCashFlow.collection_target).label("mt"),
            ),
            user,
            db,
            FinanceCashFlow,
        )
        .group_by(FinanceCashFlow.project_id, FinanceCashFlow.reporting_month)
    ).subquery()
    total_unbilled = db.query(func.coalesce(func.sum(cf_sub.c.mu), 0)).scalar() or 0
    total_collected = db.query(func.coalesce(func.sum(cf_sub.c.mc), 0)).scalar() or 0
    total_bad_debt = db.query(func.coalesce(func.sum(cf_sub.c.mbd), 0)).scalar() or 0
    total_collection_target = db.query(func.coalesce(func.sum(cf_sub.c.mt), 0)).scalar() or 0
    collection_pending = total_collection_target - total_collected

    return {
        "revenue_actual": round(total_rev_actual, 2),
        "revenue_budget": round(total_rev_budget, 2),
        "rev_attainment": round((total_rev_actual / total_rev_budget * 100), 1) if total_rev_budget > 0 else 0,
        "total_cm": round(total_cm_actual, 2),
        "total_unbilled": round(total_unbilled, 2),
        "total_collected": round(total_collected, 2),
        "total_bad_debt": round(total_bad_debt, 2),
        "total_collection_target": round(total_collection_target, 2),
        "collection_pending": round(collection_pending, 2),
        "collection_efficiency": round((total_collected / (total_collected + total_unbilled) * 100), 1) if (total_collected + total_unbilled) > 0 else 0,
    }

@app.get("/finance/data")
async def get_finance_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Account-wise monthly financial ledger entries.
    Replaces per-row sub-queries with two bulk fetches + in-memory join.
    """
    from sqlalchemy.orm import joinedload
    from fastapi.responses import JSONResponse

    # Revenue ledger rows + project in one JOIN
    revenue_ledgers = (
        apply_project_scope(
            db.query(FinanceMonthlyLedger)
            .options(
                joinedload(FinanceMonthlyLedger.project).joinedload(Project.project_head_user),
            )
            .filter(FinanceMonthlyLedger.metric_category == "Revenue"),
            user,
            db,
            FinanceMonthlyLedger,
        )
        .order_by(FinanceMonthlyLedger.reporting_month.desc())
        .all()
    )

    # Collapse legacy duplicate Revenue rows per (project, month) without mutating ORM state
    merged_rev: dict = {}
    for l in sorted(revenue_ledgers, key=lambda x: x.id):
        k = (l.project_id, l.reporting_month)
        if k not in merged_rev:
            merged_rev[k] = {
                "id": l.id,
                "project_id": l.project_id,
                "reporting_month": l.reporting_month,
                "project": l.project,
                "rev_budget": float(l.budget_value or 0),
                "rev_forecast": float(l.forecast_value or 0),
                "rev_actual": float(l.actual_value or 0),
            }
        else:
            m = merged_rev[k]
            m["rev_budget"] = max(m["rev_budget"], float(l.budget_value or 0))
            m["rev_forecast"] = max(m["rev_forecast"], float(l.forecast_value or 0))
            m["rev_actual"] = max(m["rev_actual"], float(l.actual_value or 0))
    revenue_rows = sorted(
        merged_rev.values(),
        key=lambda r: r["reporting_month"] or datetime.datetime.min,
        reverse=True,
    )

    _finance_project_ids = sorted({r["project_id"] for r in revenue_rows if r.get("project_id")})
    _assign_heads_map = assigned_project_heads_by_project(db, _finance_project_ids)

    # CM keyed by (project_id, month); max() merges any legacy duplicate CM rows
    cm_rows = (
        apply_project_scope(
            db.query(
                FinanceMonthlyLedger.project_id,
                FinanceMonthlyLedger.reporting_month,
                FinanceMonthlyLedger.actual_value,
            ).filter(FinanceMonthlyLedger.metric_category == "Contribution Margin"),
            user,
            db,
            FinanceMonthlyLedger,
        )
        .all()
    )
    cm_map: dict = {}
    for r in cm_rows:
        k = (r.project_id, r.reporting_month)
        v = float(r.actual_value or 0)
        cm_map[k] = max(cm_map.get(k, 0.0), v)

    kpi_objs = (
        apply_project_scope(db.query(FinanceEfficiencyKPI), user, db, FinanceEfficiencyKPI)
        .order_by(FinanceEfficiencyKPI.id)
        .all()
    )
    kpi_map: dict = {}
    for r in kpi_objs:
        k = (r.project_id, r.reporting_month)
        m = kpi_map.setdefault(
            k,
            {
                "wl1": 0.0,
                "overall_hc": 0.0,
                "taggd_joiners": 0.0,
                "target_ppc_inr": None,
                "target_revenue_per_recruiter": None,
                "metrics_updated_at": None,
                "metrics_updated_by_user_id": None,
            },
        )
        m["wl1"] = max(m["wl1"], float(r.actual_headcount_wl1 or 0))
        m["overall_hc"] = max(m["overall_hc"], float(r.actual_headcount_finance or 0))
        m["taggd_joiners"] = max(m["taggd_joiners"], float(r.taggd_joiners or 0))
        if r.target_ppc_inr is not None:
            m["target_ppc_inr"] = float(r.target_ppc_inr)
        if r.target_revenue_per_recruiter is not None:
            m["target_revenue_per_recruiter"] = float(r.target_revenue_per_recruiter)
        if r.metrics_updated_at is not None:
            prev = m["metrics_updated_at"]
            if prev is None or r.metrics_updated_at >= prev:
                m["metrics_updated_at"] = r.metrics_updated_at
                m["metrics_updated_by_user_id"] = r.metrics_updated_by_user_id

    cost_rows = (
        apply_project_scope(
            db.query(
                FinanceMonthlyLedger.project_id,
                FinanceMonthlyLedger.reporting_month,
                FinanceMonthlyLedger.actual_cost,
            ).filter(FinanceMonthlyLedger.metric_category == "Cost"),
            user,
            db,
            FinanceMonthlyLedger,
        )
        .all()
    )
    cost_map: dict = {}
    for r in cost_rows:
        k = (r.project_id, r.reporting_month)
        v = float(r.actual_cost or 0)
        cost_map[k] = max(cost_map.get(k, 0.0), v)

    # Merge cashflow rows on same key (legacy duplicates) — plain dicts, no ORM mutation
    cash_all = apply_project_scope(db.query(FinanceCashFlow), user, db, FinanceCashFlow).all()
    cash_map: dict = {}
    for r in cash_all:
        k = (r.project_id, r.reporting_month)
        if k not in cash_map:
            cash_map[k] = {
                "unbilled": float(r.unbilled_amount or 0),
                "collected": float(r.actual_collected or 0),
                "bad_debt": float(r.bad_debt or 0),
                "collection_target": float(r.collection_target or 0),
            }
            continue
        o = cash_map[k]
        o["unbilled"] = max(o["unbilled"], float(r.unbilled_amount or 0))
        o["collected"] = max(o["collected"], float(r.actual_collected or 0))
        o["bad_debt"] = max(o["bad_debt"], float(r.bad_debt or 0))
        o["collection_target"] = max(o["collection_target"], float(r.collection_target or 0))

    def _safe_ratio(num: float, den: float):
        if den and float(den) != 0:
            return round(float(num) / float(den), 6)
        return None

    res = []
    for row in revenue_rows:
        project = row["project"]
        key = (row["project_id"], row["reporting_month"])
        cm_val = float(cm_map.get(key, 0.0) or 0.0)
        cash_row = cash_map.get(key)
        rb, rf, ra = row["rev_budget"], row["rev_forecast"], row["rev_actual"]
        coll = float(cash_row["collected"]) if cash_row else 0.0
        ct = float(cash_row["collection_target"]) if cash_row else 0.0
        bd = float(cash_row["bad_debt"]) if cash_row else 0.0
        km = kpi_map.get(
            key,
            {
                "wl1": 0.0,
                "overall_hc": 0.0,
                "taggd_joiners": 0.0,
                "target_ppc_inr": None,
                "target_revenue_per_recruiter": None,
                "metrics_updated_at": None,
                "metrics_updated_by_user_id": None,
            },
        )
        wl1_hc = float(km["wl1"] or 0.0)
        overall_hc = float(km["overall_hc"] or 0.0)
        taggd_j = float(km["taggd_joiners"] or 0.0)
        total_cost = float(cost_map.get(key, 0.0) or 0.0)
        # Taggd source productivity = Taggd joiners ÷ WL1 HC
        taggd_joiner_productivity = _safe_ratio(taggd_j, wl1_hc)
        # PPC (INR per HC) = Actual cost ÷ Overall headcount — formula only, not sheet Actual_PPC
        ppc = _safe_ratio(total_cost, overall_hc)
        # Revenue productivity = Actual revenue ÷ WL1 HC
        revenue_productivity = _safe_ratio(ra, wl1_hc)
        # CM % = Actual CM ÷ Actual revenue
        cm_pct = round((cm_val / ra) * 100, 2) if ra and float(ra) != 0 else None
        tgt_ppc = km.get("target_ppc_inr")
        ppc_ach_pct = None
        if tgt_ppc is not None and float(tgt_ppc) > 0 and ppc is not None:
            ppc_ach_pct = round((float(ppc) / float(tgt_ppc)) * 100, 2)
        trpr = km.get("target_revenue_per_recruiter")
        rev_prod_ach_pct = None
        if trpr is not None and float(trpr) > 0 and revenue_productivity is not None:
            rev_prod_ach_pct = round((float(revenue_productivity) / float(trpr)) * 100, 2)
        mu_at = km.get("metrics_updated_at")
        mu_uid = km.get("metrics_updated_by_user_id")
        _ph_assigned = _assign_heads_map.get(row["project_id"], []) if project else []
        _project_head_label = resolve_project_head_label(project, _ph_assigned) if project else None
        res.append({
            "id": row["id"],
            "project_id": row["project_id"],
            "account_name": project.account_name if project else "Unknown",
            "vertical": project.vertical if project else "N/A",
            "project_head": _project_head_label,
            "practice_head": (project.practice_head or None) if project else None,
            "month": row["reporting_month"].strftime("%b-%y") if row["reporting_month"] else "N/A",
            "month_sort": row["reporting_month"].isoformat() if row["reporting_month"] else "",
            "rev_budget": rb,
            "rev_actual": ra,
            "rev_forecast": rf,
            "cm_actual": cm_val,
            "cm_pct": cm_pct,
            "unbilled": cash_row["unbilled"] if cash_row else 0.0,
            "collected": coll,
            "bad_debt": bd,
            "collection_target": ct,
            "collection_pending": round(ct - coll, 2),
            "attainment": round((ra / rb * 100), 1) if rb > 0 else 0,
            "actual_headcount_wl1": wl1_hc,
            "actual_headcount_overall": overall_hc,
            "taggd_joiners": taggd_j,
            "total_cost_inr": total_cost,
            "taggd_joiner_productivity": taggd_joiner_productivity,
            "taggd_source_productivity": taggd_joiner_productivity,
            "ppc_inr": ppc,
            "target_ppc_inr": tgt_ppc,
            "ppc_ach_pct": ppc_ach_pct,
            "target_revenue_per_recruiter": km.get("target_revenue_per_recruiter"),
            "revenue_productivity_inr": revenue_productivity,
            "rev_prod_ach_pct": rev_prod_ach_pct,
            "metrics_updated_at": mu_at.isoformat() if mu_at else None,
            "metrics_updated_by_user_id": mu_uid,
            "metrics_updated_by_email": None,
        })

    uids = {r["metrics_updated_by_user_id"] for r in res if r.get("metrics_updated_by_user_id")}
    if uids:
        email_map = {u.id: u.email for u in db.query(User).filter(User.id.in_(uids)).all()}
        for r in res:
            uid = r.get("metrics_updated_by_user_id")
            if uid:
                r["metrics_updated_by_email"] = email_map.get(uid)

    return JSONResponse(
        content=res,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=60"},
    )

@app.post("/finance/upload")
async def upload_finance_master(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload and ingest the Corporate Finance Master file."""
    temp_dir = tempfile.gettempdir()
    safe_name = os.path.basename(file.filename or "finance.xlsx") or "finance.xlsx"
    file_path = os.path.join(temp_dir, f"finance_master_{int(time.time())}_{safe_name}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Run the Finance ingestion pipeline
        ingest_finance_master(file_path)
        log_ingestion_event(
            db,
            user=user,
            kind="finance",
            filename=safe_name,
            status="success",
            label="Complete",
            project_id=None,
        )
        return {"status": "success", "message": "Corporate Finance file processed successfully."}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        log_ingestion_event(
            db,
            user=user,
            kind="finance",
            filename=safe_name,
            status="error",
            label="Failed",
            project_id=None,
        )
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ANALYSIS AGENT — Chat API
# ─────────────────────────────────────────────────────────────────────────────
import uuid as _uuid
from .agents.analysis_agent import AnalysisAgent as _AnalysisAgent

# In-memory session store: {session_id: {"messages": [...], "created_at": str}}
_agent_sessions: dict = {}
_analysis_agent: _AnalysisAgent | None = None


def _get_analysis_agent() -> _AnalysisAgent:
    global _analysis_agent
    if _analysis_agent is None:
        _analysis_agent = _AnalysisAgent()
    return _analysis_agent


class AgentChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    # Optional: pre-resolve a client context
    client_hint: str | None = None


class AgentChatResponse(BaseModel):
    session_id: str
    response: str
    tool_calls: list
    messages: list


@app.post("/agent/chat")
def agent_chat(
    req: AgentChatRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """
    Multi-turn chat with the Nexus Analysis Agent.
    Supply session_id to continue a conversation; omit for a new session.
    """
    try:
        agent = _get_analysis_agent()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Resolve or create session
    session_id = req.session_id or str(_uuid.uuid4())
    session = _agent_sessions.get(session_id, {"messages": []})

    # Append new user message
    messages = list(session["messages"])
    messages.append({"role": "user", "content": req.message})

    # Run agent
    try:
        result = agent.chat(messages=messages, db=db, user=_user)
    except Exception as exc:
        import traceback as _tb
        print(_tb.format_exc())
        raise HTTPException(status_code=500, detail=f"Agent error: {str(exc)}")

    # Persist session (cap at 50 messages to avoid memory bloat)
    updated = result["updated_messages"][-50:]
    _agent_sessions[session_id] = {
        "messages": updated,
        "created_at": session.get("created_at", datetime.datetime.utcnow().isoformat()),
    }

    return AgentChatResponse(
        session_id=session_id,
        response=result["response"],
        tool_calls=result["tool_calls"],
        messages=updated,
    )


@app.get("/agent/session/{session_id}")
def get_agent_session(session_id: str):
    """Retrieve conversation history for a session."""
    session = _agent_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": session["messages"]}


@app.delete("/agent/session/{session_id}")
def clear_agent_session(session_id: str):
    """Clear a conversation session."""
    _agent_sessions.pop(session_id, None)
    return {"status": "cleared"}
