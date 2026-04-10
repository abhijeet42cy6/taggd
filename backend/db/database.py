from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, Date, ForeignKey, Text, Boolean, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker, relationship
import datetime

import os

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///./revenue_generator.db")
SQLALCHEMY_DATABASE_URL = DB_PATH

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    """Platform login: legacy admin|executive|manager or canonical platform_admin|executive|operations|project_head|recruiter."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    manager_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    vertical_access_json = Column(JSON, nullable=True)

    project_assignments = relationship(
        "UserProjectAssignment",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserProjectAssignment(Base):
    __tablename__ = "user_project_assignments"
    __table_args__ = (UniqueConstraint("user_id", "project_id", name="uq_user_project_assignment"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    user = relationship("User", back_populates="project_assignments")
    project = relationship("Project", backref="user_assignments")


class IngestionEvent(Base):
    """Audit trail for uploads / ingest runs (used by Ingestion Center activity feed)."""

    __tablename__ = "ingestion_events"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    kind = Column(String(64), nullable=False, index=True)
    filename = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False)
    label = Column(String(255), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])


class ActivityLog(Base):
    """Unified audit trail: requisitions, KPI edits, uploads, etc."""

    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(32), nullable=False, index=True)
    resource_type = Column(String(64), nullable=False, index=True)
    resource_id = Column(String(128), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    summary = Column(String(512), nullable=False)
    meta_json = Column(JSON, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])


class AuditMixin:
    system_created_at = Column(DateTime, default=datetime.datetime.utcnow)
    system_updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    source_filename = Column(String)
    uploaded_by = Column(String, default="System")


class Client(Base, AuditMixin):
    """Legal / rollup account (e.g. TATA). Projects under the same client are SBUs / engagements."""

    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    official_name = Column(String, nullable=False, index=True)
    short_code = Column(String, nullable=True, index=True)

    projects = relationship("Project", back_populates="client")


class Project(Base, AuditMixin):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True) # Removed unique=True to allow multiple accounts from one manifest file
    tracker_sheet = Column(String)
    contract_sheet = Column(String)

    client_id = Column(Integer, ForeignKey("clients.id", ondelete="RESTRICT"), nullable=True, index=True)
    # SBU / engagement label (e.g. TATA Motors); finance rows often key off account_name — keep both aligned in ingest
    engagement_name = Column(String, nullable=True, index=True)
    project_head_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    client = relationship("Client", back_populates="projects")
    
    # Enhanced Enterprise Metadata
    account_name = Column(String, index=True)
    charge_code = Column(String, index=True)  # e.g. TRP0001T00NM1GIA — client / charge identifier
    account_status = Column(String)  # e.g. Active, Not Active
    region = Column(String)
    sub_region = Column(String)  # e.g. West 1 (distinct from category / TARA bucket)
    practice_head = Column(String)
    # RPO / scorecard: accountable project head (may match practice_head or differ by org)
    project_head = Column(String, nullable=True)
    regional_head = Column(String)  # e.g. Baljeet Singh
    function_head = Column(String)  # e.g. Kamakshi
    be_spoc = Column(String)
    category = Column(String)  # e.g. Non TARA, TARA
    vertical = Column(String) # e.g. Pharma, Auto
    practice = Column(String) # e.g. Lateral, RPO (account type)
    
    
    # Store the generated mapping and calculation logic for this project
    column_mapping = Column(JSON) # Map of Universal Key -> Excel Header
    revenue_logic_code = Column(Text) # The synthesized Python function
    logic_explanation = Column(Text)  # Natural language explanation of the revenue logic
    pos_id_column = Column(String) # The header used for deduplication (Req ID, etc.)
    
    records = relationship("Record", back_populates="project")
    metrics = relationship("MetricDefinition", back_populates="project")
    wfm_benchmarks = relationship("WFMHRBenchmark", back_populates="project")
    wfm_gaps = relationship("WFMResourceGap", back_populates="project")
    finance_ledger = relationship("FinanceMonthlyLedger", back_populates="project")
    finance_cashflow = relationship("FinanceCashFlow", back_populates="project")
    finance_kpis = relationship("FinanceEfficiencyKPI", back_populates="project")
    revenue_forecast_weekly = relationship(
        "RevenueForecastWeekly", back_populates="project", cascade="all, delete-orphan"
    )
    revenue_visibility_snapshots = relationship(
        "RevenueVisibilitySnapshot", back_populates="project", cascade="all, delete-orphan"
    )
    taggd_revenue_billing_rows = relationship(
        "TaggdRevenueBilling", back_populates="project", cascade="all, delete-orphan"
    )
    candidates = relationship("Candidate", back_populates="project", cascade="all, delete-orphan")
    contracts = relationship(
        "ProjectContract",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    meetings = relationship(
        "Meeting",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectContract(Base, AuditMixin):
    """Commercial contract / signup snapshot per project (SBU), sourced from contract workbook or platform edits."""

    __tablename__ = "project_contracts"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True)

    customer_name = Column(String, nullable=True, index=True)
    account_type = Column(String, nullable=True)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    renewal_reminder_date = Column(Date, nullable=True)
    duration_months = Column(Integer, nullable=True)

    signed_acv_inr = Column(Float, nullable=True)
    contract_status = Column(String, nullable=True, index=True)
    signed_cm_pct = Column(Float, nullable=True)
    headcount_contracted = Column(Float, nullable=True)
    hiring_volume = Column(Float, nullable=True)
    taggd_source_mix = Column(String, nullable=True)
    other_source_mix = Column(String, nullable=True)
    overall_rph = Column(Float, nullable=True)

    mmf_applicable = Column(Boolean, nullable=True)
    opening_fee_applicable = Column(Boolean, nullable=True)
    payment_terms = Column(Text, nullable=True)
    pricing_model = Column(String, nullable=True)
    contract_detail = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)

    agreed_rate_fee_inr = Column(Float, nullable=True)
    est_annual_value_inr = Column(Float, nullable=True)
    sow_msa_reference = Column(String, nullable=True)
    sla_terms_summary = Column(Text, nullable=True)
    positions_contracted = Column(Integer, nullable=True)
    positions_filled = Column(Integer, nullable=True)
    renewal_status = Column(String, nullable=True)
    reason_for_lapse = Column(Text, nullable=True)
    client_signoff_authority = Column(String, nullable=True)
    internal_signoff = Column(String, nullable=True)
    revenue_run_rate_inr = Column(Float, nullable=True)
    practice_head_snapshot = Column(String, nullable=True)

    project = relationship("Project", back_populates="contracts")
    client = relationship("Client", backref="project_contracts")


class Meeting(Base):
    """Customer / internal governance meetings captured from the platform UI (MoM-style)."""

    __tablename__ = "platform_meetings"

    id = Column(Integer, primary_key=True, index=True)
    meeting_title = Column(String(512), nullable=True)
    meeting_type = Column(String(128), nullable=True, index=True)
    meeting_date = Column(Date, nullable=True, index=True)
    start_time = Column(String(32), nullable=True)
    end_time = Column(String(32), nullable=True)

    organizer_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    organizer_name = Column(String(255), nullable=True)

    attendees_internal = Column(Text, nullable=True)
    attendees_external = Column(Text, nullable=True)
    external_attendees_json = Column(JSON, nullable=True)

    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    account_name_snapshot = Column(String(512), nullable=True, index=True)

    agenda_items = Column(Text, nullable=True)
    discussion_summary = Column(Text, nullable=True)
    decisions_taken = Column(Text, nullable=True)
    key_discussion_points = Column(Text, nullable=True)

    follow_up_date = Column(Date, nullable=True)
    next_meeting_date = Column(Date, nullable=True)

    meeting_mode = Column(String(64), nullable=True)
    meeting_status = Column(String(64), nullable=True, index=True)

    attachments_json = Column(JSON, nullable=True)
    mom_status = Column(String(64), nullable=True, index=True)
    mom_link_remarks = Column(Text, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_email = Column(String(255), nullable=True)
    system_created_at = Column(DateTime, default=datetime.datetime.utcnow)
    system_updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    organizer_user = relationship("User", foreign_keys=[organizer_user_id])
    creator = relationship("User", foreign_keys=[created_by_user_id])
    project = relationship("Project", back_populates="meetings")
    action_items = relationship(
        "MeetingActionItem",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="MeetingActionItem.sort_order",
    )


class MeetingActionItem(Base):
    __tablename__ = "meeting_action_items"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("platform_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(Text, nullable=True)
    owner = Column(String(255), nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String(64), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    meeting = relationship("Meeting", back_populates="action_items")


class ResumeSupplierLicense(Base):
    """Org-level job board / resume vendor license cost tracker (not tied to projects)."""

    __tablename__ = "resume_supplier_licenses"

    id = Column(Integer, primary_key=True, index=True)
    vendor_name = Column(String(512), nullable=False, index=True)
    login_ids_count = Column(Integer, nullable=True)
    resume_inventory = Column(String(255), nullable=True)
    job_postings = Column(Integer, nullable=True)
    naukri_invites = Column(Integer, nullable=True)
    utilization = Column(String(255), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    contract_duration_months = Column(Integer, nullable=True)
    cost_inr = Column(Float, nullable=True)

    primary_person_name = Column(String(255), nullable=True)
    primary_person_phone = Column(String(64), nullable=True)
    primary_person_email = Column(String(255), nullable=True)
    secondary_person_name = Column(String(255), nullable=True)
    secondary_person_phone = Column(String(64), nullable=True)
    secondary_person_email = Column(String(255), nullable=True)

    remarks = Column(Text, nullable=True)
    fiscal_year_label = Column(String(64), nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, default=0, index=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    system_created_at = Column(DateTime, default=datetime.datetime.utcnow)
    system_updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Task(Base):
    """Cross-cutting work items: deadlines, multi-assignee, optional link to platform entities."""

    __tablename__ = "platform_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="open", index=True)
    priority = Column(String(16), nullable=True, index=True)
    task_category = Column(String(64), nullable=True, index=True)
    task_subtype = Column(String(128), nullable=True)
    linked_resource_type = Column(String(64), nullable=True, index=True)
    linked_resource_id = Column(String(128), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    due_at = Column(DateTime, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    completed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    meta_json = Column(JSON, nullable=True)
    system_created_at = Column(DateTime, default=datetime.datetime.utcnow)
    system_updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", backref="platform_tasks")
    assignments = relationship(
        "TaskAssignee",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignee_user"),)

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("platform_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    assignee_role = Column(String(32), nullable=False, default="assignee")

    task = relationship("Task", back_populates="assignments")
    user = relationship("User", backref="task_assignee_links")


class Record(Base, AuditMixin):
    """Tracker row / requisition mandate. Legacy columns remain for ingest + revenue; RPO fields extend for Req. ID grain."""

    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    # --- Universal Keys (Robust standard columns) ---
    candidate_name = Column(String, index=True)
    position_title = Column(String)
    status = Column(String, index=True) # Joined, Offered, etc.
    hiring_manager = Column(String)
    hiring_manager_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_recruiter_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    offered_ctc = Column(Float)
    joining_date = Column(DateTime)
    creation_date = Column(DateTime)
    location = Column(String)
    department = Column(String)
    
    # --- Flexible Storage ---
    # Stores ALL other attributes from the excel row as JSON
    additional_attributes = Column(JSON) # Store original excel columns not mapped
    
    # --- Calculation Results ---
    # Stores the results of the revenue generated code
    # e.g., {"revenue": 150000, "opening_fee": 50000, "closing_fee": 100000, "status": "calculated"}
    revenue_results = Column(JSON)     # Store calculated revenue, status, etc.
    global_status = Column(String, index=True) # Normalized Global State: CLOSED, ACTIVE, PIPELINE, etc.
    
    # --- Delta-Sync Tracking (The Fingerprint) ---
    fingerprint = Column(String, index=True) # Unique Hash for row identity over time
    excel_provided_id = Column(String, index=True) # The ID found in the Excel (Req ID, Sl No, etc.)
    excel_row_index = Column(Integer) # Spatial context from original excel

    # --- RPO Requisition Tracker (first-class + requisition_extras JSON) ---
    client_req_id = Column(String, nullable=True, index=True)  # Req. ID from client template
    rpo_client_name = Column(String, nullable=True)  # Client Name column (may mirror project.account_name)
    positions_open = Column(Integer, nullable=True)
    rpo_priority = Column(String, nullable=True)
    rpo_job_type = Column(String, nullable=True)
    experience_years_required = Column(String, nullable=True)
    ctc_budget_lpa = Column(Float, nullable=True)
    rpo_source_of_hire = Column(String, nullable=True)
    rpo_sub_source = Column(String, nullable=True)
    profiles_sourced = Column(Integer, nullable=True)
    profiles_submitted = Column(Integer, nullable=True)
    interviews_scheduled = Column(Integer, nullable=True)
    offers_released = Column(Integer, nullable=True)
    offers_accepted = Column(Integer, nullable=True)
    assigned_recruiter_rpo = Column(String, nullable=True)
    rpo_mandate_status = Column(String, nullable=True)
    rpo_vertical = Column(String, nullable=True)
    rpo_division = Column(String, nullable=True)
    rpo_bu_sbu = Column(String, nullable=True)
    rpo_zone = Column(String, nullable=True)
    rpo_grade_band = Column(String, nullable=True)
    rpo_business_hrbp = Column(String, nullable=True)
    rpo_sourcer = Column(String, nullable=True)
    rpo_taggd_pm = Column(String, nullable=True)
    rpo_hiring_agency = Column(String, nullable=True)
    rpo_ijp_referral = Column(String, nullable=True)
    mandate_received_date = Column(DateTime, nullable=True)
    intake_date = Column(DateTime, nullable=True)
    first_cv_share_date = Column(DateTime, nullable=True)
    selection_date_req = Column(DateTime, nullable=True)
    loi_date_req = Column(DateTime, nullable=True)
    closure_date_req = Column(DateTime, nullable=True)
    rpo_stage = Column(String, nullable=True)
    ageing_days = Column(Integer, nullable=True)
    ageing_bracket = Column(String, nullable=True)
    dead_days = Column(Integer, nullable=True)
    tto_days = Column(Integer, nullable=True)
    ttf_days = Column(Integer, nullable=True)
    taggd_fees_amount = Column(Float, nullable=True)
    billing_month = Column(String, nullable=True)
    fy_label = Column(String, nullable=True)
    requisition_extras = Column(JSON, nullable=True)
    
    project = relationship("Project", back_populates="records")
    candidates = relationship("Candidate", back_populates="requisition", cascade="all, delete-orphan")


class Candidate(Base, AuditMixin):
    """Candidate pipeline + offer/onboarding; links to requisition (`records`) and project."""

    __tablename__ = "candidates"
    __table_args__ = (UniqueConstraint("project_id", "client_candidate_id", name="uq_candidate_project_client_id"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    record_id = Column(Integer, ForeignKey("records.id", ondelete="CASCADE"), nullable=False, index=True)

    client_candidate_id = Column(String, nullable=False, index=True)
    full_name = Column(String, nullable=True, index=True)
    contact_no = Column(String, nullable=True)
    email_id = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    current_location = Column(String, nullable=True)
    qualification = Column(String, nullable=True)
    specialization = Column(String, nullable=True)
    total_experience_yrs = Column(Float, nullable=True)
    current_organization = Column(String, nullable=True)
    current_designation = Column(String, nullable=True)
    notice_period_days = Column(Integer, nullable=True)
    alternate_contact_no = Column(String, nullable=True)
    source_of_hire = Column(String, nullable=True)
    sub_source = Column(String, nullable=True)
    current_ctc_lpa = Column(Float, nullable=True)
    expected_ctc_lpa = Column(Float, nullable=True)
    resume_screening = Column(String, nullable=True)
    assigned_recruiter = Column(String, nullable=True)
    hiring_manager = Column(String, nullable=True)
    hiring_manager_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_recruiter_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    current_stage = Column(String, nullable=True, index=True)
    offer_ctc_lpa = Column(Float, nullable=True)
    offer_release_date = Column(DateTime, nullable=True)
    offer_acceptance = Column(String, nullable=True)
    expected_doj = Column(DateTime, nullable=True)
    actual_doj = Column(DateTime, nullable=True)
    selection_date = Column(DateTime, nullable=True)
    loi_issue_date = Column(DateTime, nullable=True)
    cb_closure_date = Column(DateTime, nullable=True)
    fingerprint = Column(String, nullable=True, index=True)
    excel_row_index = Column(Integer, nullable=True)
    revenue_results = Column(JSON, nullable=True)
    global_status = Column(String, nullable=True, index=True)
    candidate_extras = Column(JSON, nullable=True)
    offer_date = Column(DateTime, nullable=True)
    offer_accepted_flag = Column(String, nullable=True)
    decline_reason = Column(String, nullable=True)
    joining_status = Column(String, nullable=True)
    checkin_30_day = Column(String, nullable=True)
    checkin_60_day = Column(String, nullable=True)
    checkin_90_day = Column(String, nullable=True)
    early_exit_risk = Column(String, nullable=True)
    offered_gross_ctc = Column(Float, nullable=True)
    offered_stvs = Column(Float, nullable=True)
    hike_pct_offered = Column(Float, nullable=True)
    bgv_date = Column(DateTime, nullable=True)
    bgv_status = Column(String, nullable=True)
    medical_initiation_date = Column(DateTime, nullable=True)
    candidate_staff_no = Column(String, nullable=True)
    msil_staff_no = Column(String, nullable=True)
    sourcer_name = Column(String, nullable=True)
    taggd_pm = Column(String, nullable=True)
    offer_onboarding_extras = Column(JSON, nullable=True)

    project = relationship("Project", back_populates="candidates")
    requisition = relationship("Record", back_populates="candidates")

class MetricDefinition(Base, AuditMixin):
    __tablename__ = "metric_definitions"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    metric_label = Column(String)
    metric_group = Column(String)
    metric_nature = Column(String)
    target_threshold = Column(String)
    definition = Column(Text)
    calculation_method = Column(Text)
    formula = Column(Text)
    source_system = Column(String)
    
    performances = relationship("SLAPerformance", back_populates="definition")
    project = relationship("Project", back_populates="metrics")

class SLAPerformance(Base, AuditMixin):
    __tablename__ = "sla_performances"
    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey("metric_definitions.id"))
    
    reporting_month = Column(String)  # Canonical "YYYY-MM" when period_start is set; legacy free-text otherwise
    period_start = Column(Date, nullable=True, index=True)  # First day of reporting month (calendar month)
    score = Column(String)
    rag_status = Column(String)
    
    definition = relationship("MetricDefinition", back_populates="performances")

class WFMHRBenchmark(Base, AuditMixin):
    __tablename__ = "wfm_hr_benchmarks"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    reporting_date = Column(DateTime)
    lateral_revenue_target = Column(Float)
    lateral_hc_target = Column(Float)
    lateral_productivity_target = Column(Float)
    ideal_hc = Column(Float)
    actual_hc_total = Column(Integer)
    
    # Successful hires by level (The core metric)
    wl1_hires = Column(Integer, default=0)
    wl2_hires = Column(Integer, default=0)
    wl3_hires = Column(Integer, default=0)
    wl4_hires = Column(Integer, default=0)
    
    project = relationship("Project", back_populates="wfm_benchmarks")

class WFMResourceGap(Base, AuditMixin):
    __tablename__ = "wfm_resource_gaps"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    req_id = Column(String, index=True) # TGD/A-W/1610192
    status = Column(String) # Approved, Open
    hiring_type = Column(String) # New, Replacement
    designation_level = Column(String) # WL1, WL2
    target_date = Column(DateTime)
    
    project = relationship("Project", back_populates="wfm_gaps")

class FinanceMonthlyLedger(Base, AuditMixin):
    __tablename__ = "finance_monthly_ledger"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    reporting_month = Column(DateTime)
    metric_category = Column(String) # Revenue, Contribution Margin
    budget_value = Column(Float, default=0.0)
    forecast_value = Column(Float, default=0.0)
    actual_value = Column(Float, default=0.0)
    actual_cost = Column(Float, default=0.0)

    metrics_last_updated_at = Column(DateTime, nullable=True)
    metrics_last_updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    project = relationship("Project", back_populates="finance_ledger")
    metrics_last_updated_by = relationship("User", foreign_keys=[metrics_last_updated_by_user_id])

class FinanceCashFlow(Base, AuditMixin):
    __tablename__ = "finance_cash_flow"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    reporting_month = Column(DateTime)
    unbilled_amount = Column(Float, default=0.0)
    collection_target = Column(Float, default=0.0)
    actual_collected = Column(Float, default=0.0)
    bad_debt = Column(Float, default=0.0)
    adjustments = Column(Float, default=0.0)

    metrics_last_updated_at = Column(DateTime, nullable=True)
    metrics_last_updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    project = relationship("Project", back_populates="finance_cashflow")
    metrics_last_updated_by = relationship("User", foreign_keys=[metrics_last_updated_by_user_id])

class FinanceEfficiencyKPI(Base, AuditMixin):
    __tablename__ = "finance_efficiency_kpis"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    reporting_month = Column(DateTime)
    target_revenue_per_recruiter = Column(Float, default=0.0)
    approved_headcount = Column(Integer, default=0)
    actual_headcount_finance = Column(Integer, default=0)
    # WL1 HC from finance master sheet "Actual Headcount WL1" (may be fractional)
    actual_headcount_wl1 = Column(Float, default=0.0)
    # Monthly Taggd-sourced joiner count (sheet Taggd_Source_Joiner)
    taggd_joiners = Column(Float, default=0.0)
    # Target PPC (INR per overall HC). Actual PPC is always ledger Actual Cost ÷ overall HC (see /finance/data).
    target_ppc_inr = Column(Float, nullable=True)
    metrics_updated_at = Column(DateTime, nullable=True)
    metrics_updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project", back_populates="finance_kpis")
    metrics_updated_by = relationship("User", foreign_keys=[metrics_updated_by_user_id])


class RevenueForecastWeekly(Base):
    """TAGGD-style weekly revenue forecast row; amounts stored in INR (API accepts Lakhs)."""

    __tablename__ = "revenue_forecast_weekly"
    __table_args__ = (UniqueConstraint("project_id", "week_start_date", name="uq_rev_fcst_week"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(DateTime, nullable=False, index=True)
    week_label = Column(String, nullable=True)
    month_anchor = Column(DateTime, nullable=False)
    update_date = Column(DateTime, nullable=False)

    revenue_forecast_inr = Column(Float, default=0.0)
    adjustment_inr = Column(Float, default=0.0)
    penalty_inr = Column(Float, default=0.0)
    bad_debts_inr = Column(Float, default=0.0)
    mmf_inr = Column(Float, default=0.0)
    open_fee_inr = Column(Float, default=0.0)
    joiner_fee_inr = Column(Float, default=0.0)
    to_be_offer_fee_inr = Column(Float, default=0.0)
    net_revenue_inr = Column(Float, default=0.0)

    open_req = Column(Integer, default=0)
    joiner_count = Column(Integer, default=0)
    to_be_offer_count = Column(Integer, default=0)
    achievement_pct = Column(Float, nullable=True)

    remarks = Column(Text, nullable=True)
    entered_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project", back_populates="revenue_forecast_weekly")
    entered_by = relationship("User", foreign_keys=[entered_by_user_id])

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class RevenueVisibilitySnapshot(Base):
    """RPO pipeline / revenue visibility snapshot; money columns in INR."""

    __tablename__ = "revenue_visibility_snapshot"
    __table_args__ = (UniqueConstraint("project_id", "as_of_date", name="uq_rev_vis_asof"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    as_of_date = Column(DateTime, nullable=False, index=True)

    practice_head = Column(String, nullable=True)
    mmf_inr = Column(Float, default=0.0)
    open_req = Column(Integer, default=0)
    opening_fee_inr = Column(Float, default=0.0)
    joiners_as_on_date = Column(Integer, default=0)
    joining_fee_inr = Column(Float, default=0.0)
    yet_to_join = Column(Integer, default=0)
    ytj_fee_inr = Column(Float, default=0.0)
    conversion_rate_pct = Column(Float, nullable=True)
    revenue_realised_pct = Column(Float, nullable=True)
    gap_to_mmf_inr = Column(Float, default=0.0)
    status = Column(String, nullable=True)

    entered_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project", back_populates="revenue_visibility_snapshots")
    entered_by = relationship("User", foreign_keys=[entered_by_user_id])

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class TaggdRevenueBilling(Base, AuditMixin):
    """
    TAGGD Revenue Tracker (e.g. FY) — billing / recognition row per project.
    Only project_id is required; other columns are populated over time (manual, ingest, or sync).
    Amounts in INR unless noted in API docs.
    """

    __tablename__ = "taggd_revenue_billing"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    update_date = Column(DateTime, nullable=True, index=True)
    fiscal_year_label = Column(String, nullable=True, index=True)
    project_manager = Column(String, nullable=True)

    revenue_booked_inr = Column(Float, nullable=True)
    mmf_inr = Column(Float, nullable=True)
    opening_req = Column(Integer, nullable=True)
    opening_fee_inr = Column(Float, nullable=True)
    total_joiners = Column(Integer, nullable=True)
    taggd_joiner = Column(Integer, nullable=True)
    taggd_joiner_fee_inr = Column(Float, nullable=True)
    er_ijp_other_count = Column(Integer, nullable=True)
    er_ijp_other_fee_inr = Column(Float, nullable=True)
    campus_count = Column(Integer, nullable=True)
    campus_fee_inr = Column(Float, nullable=True)
    total_joining_fee_inr = Column(Float, nullable=True)
    adjustment_reason = Column(Text, nullable=True)
    adjustment_amt_inr = Column(Float, nullable=True)
    net_revenue_inr = Column(Float, nullable=True)
    rph_inr = Column(Float, nullable=True)
    pct_of_target = Column(Float, nullable=True)

    attachment_ref = Column(String, nullable=True)
    approver_name = Column(String, nullable=True)
    invoice_number = Column(String, nullable=True)
    invoice_amount_inr = Column(Float, nullable=True)
    invoice_raised_date = Column(DateTime, nullable=True)
    payment_due_date = Column(DateTime, nullable=True)
    actual_payment_received_date = Column(DateTime, nullable=True)
    collection_received_inr = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)
    entered_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    project = relationship("Project", back_populates="taggd_revenue_billing_rows")
    entered_by = relationship("User", foreign_keys=[entered_by_user_id])


def _ensure_finance_unique_indexes():
    """Prevent duplicate ledger / cashflow rows after ingest flush fixes."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_ledger_proj_month_cat "
                    "ON finance_monthly_ledger (project_id, reporting_month, metric_category)"
                )
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_cash_proj_month "
                    "ON finance_cash_flow (project_id, reporting_month)"
                )
            )
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("finance unique indexes: %s", e)


def _ensure_revenue_tracker_indexes():
    """SQLite: unique indexes for revenue tracker tables (idempotent)."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_fcst_week "
                    "ON revenue_forecast_weekly (project_id, week_start_date)"
                )
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_vis_asof "
                    "ON revenue_visibility_snapshot (project_id, as_of_date)"
                )
            )
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("revenue tracker unique indexes: %s", e)


def _ensure_project_enterprise_columns():
    """SQLite: add enterprise metadata columns if missing (existing deployments)."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(projects)")).fetchall()
            cols = {r[1] for r in rows}
            if not cols:
                return
            alters = []
            for col, ddl in (
                ("charge_code", "VARCHAR"),
                ("account_status", "VARCHAR"),
                ("sub_region", "VARCHAR"),
                ("regional_head", "VARCHAR"),
                ("function_head", "VARCHAR"),
            ):
                if col not in cols:
                    alters.append(f"ALTER TABLE projects ADD COLUMN {col} {ddl}")
            for sql in alters:
                conn.execute(text(sql))
            conn.commit()
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_projects_charge_code ON projects (charge_code)")
            )
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("projects enterprise columns migration: %s", e)


def _ensure_sla_period_start_column():
    """SQLite: add period_start if missing (existing deployments)."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(sla_performances)")).fetchall()
            cols = {r[1] for r in rows}
            if cols and "period_start" not in cols:
                conn.execute(text("ALTER TABLE sla_performances ADD COLUMN period_start DATE"))
                conn.commit()
    except Exception as e:
        import logging

        logging.warning("sla period_start column migration: %s", e)


def _ensure_finance_efficiency_wl1_column():
    """SQLite: add actual_headcount_wl1 if missing (FY24-25 finance master WL1 sheet)."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(finance_efficiency_kpis)")).fetchall()
            cols = {r[1] for r in rows}
            if not cols:
                return
            if "actual_headcount_wl1" not in cols:
                conn.execute(
                    text("ALTER TABLE finance_efficiency_kpis ADD COLUMN actual_headcount_wl1 REAL DEFAULT 0")
                )
                conn.commit()
    except Exception as e:
        import logging

        logging.warning("finance_efficiency_kpis actual_headcount_wl1 migration: %s", e)


def _ensure_finance_efficiency_taggd_joiners_column():
    """SQLite: add taggd_joiners if missing (Taggd_Source_Joiner sheet)."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(finance_efficiency_kpis)")).fetchall()
            cols = {r[1] for r in rows}
            if not cols:
                return
            if "taggd_joiners" not in cols:
                conn.execute(
                    text("ALTER TABLE finance_efficiency_kpis ADD COLUMN taggd_joiners REAL DEFAULT 0")
                )
                conn.commit()
    except Exception as e:
        import logging

        logging.warning("finance_efficiency_kpis taggd_joiners migration: %s", e)


def _ensure_projects_project_head_column():
    """SQLite: add project_head for RPO scorecard / directory."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(projects)")).fetchall()
            cols = {r[1] for r in rows}
            if cols and "project_head" not in cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN project_head VARCHAR"))
                conn.commit()
    except Exception as e:
        import logging

        logging.warning("projects project_head migration: %s", e)


def _ensure_user_rbac_and_attribution_columns():
    """SQLite: profile columns on users + optional user FKs on projects/records/candidates."""
    from sqlalchemy import text

    def addcol(table: str, col: str, ddl: str) -> None:
        try:
            with engine.connect() as conn:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                cols = {r[1] for r in rows}
                if not cols or col in cols:
                    return
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                conn.commit()
        except Exception as e:
            import logging

            logging.warning("%s.%s migration: %s", table, col, e)

    addcol("users", "manager_user_id", "INTEGER")
    addcol("users", "vertical_access_json", "TEXT")
    addcol("projects", "project_head_user_id", "INTEGER")
    addcol("records", "hiring_manager_user_id", "INTEGER")
    addcol("records", "assigned_recruiter_user_id", "INTEGER")
    addcol("candidates", "hiring_manager_user_id", "INTEGER")
    addcol("candidates", "assigned_recruiter_user_id", "INTEGER")


def _ensure_finance_ledger_cash_metrics_audit_columns():
    """SQLite: who/when for platform edits on ledger + cashflow rows."""
    from sqlalchemy import text

    for table in ("finance_monthly_ledger", "finance_cash_flow"):
        try:
            with engine.connect() as conn:
                rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                cols = {r[1] for r in rows}
                if not cols:
                    continue
                if "metrics_last_updated_at" not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN metrics_last_updated_at DATETIME"))
                if "metrics_last_updated_by_user_id" not in cols:
                    conn.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN metrics_last_updated_by_user_id INTEGER")
                    )
                conn.commit()
        except Exception as e:
            import logging

            logging.warning("%s metrics audit columns migration: %s", table, e)


def _ensure_finance_efficiency_scorecard_columns():
    """SQLite: target PPC + monthly metrics audit on finance_efficiency_kpis."""
    from sqlalchemy import text

    alters = [
        ("target_ppc_inr", "REAL"),
        ("metrics_updated_at", "DATETIME"),
        ("metrics_updated_by_user_id", "INTEGER"),
    ]
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(finance_efficiency_kpis)")).fetchall()
            cols = {r[1] for r in rows}
            if not cols:
                return
            for col, ddl in alters:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE finance_efficiency_kpis ADD COLUMN {col} {ddl}"))
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("finance_efficiency_kpis scorecard columns migration: %s", e)


def _ensure_records_rpo_columns():
    """SQLite: add RPO requisition tracker columns on records if missing."""
    from sqlalchemy import text

    alters: list[tuple[str, str]] = [
        ("client_req_id", "VARCHAR"),
        ("rpo_client_name", "VARCHAR"),
        ("positions_open", "INTEGER"),
        ("rpo_priority", "VARCHAR"),
        ("rpo_job_type", "VARCHAR"),
        ("experience_years_required", "VARCHAR"),
        ("ctc_budget_lpa", "REAL"),
        ("rpo_source_of_hire", "VARCHAR"),
        ("rpo_sub_source", "VARCHAR"),
        ("profiles_sourced", "INTEGER"),
        ("profiles_submitted", "INTEGER"),
        ("interviews_scheduled", "INTEGER"),
        ("offers_released", "INTEGER"),
        ("offers_accepted", "INTEGER"),
        ("assigned_recruiter_rpo", "VARCHAR"),
        ("rpo_mandate_status", "VARCHAR"),
        ("rpo_vertical", "VARCHAR"),
        ("rpo_division", "VARCHAR"),
        ("rpo_bu_sbu", "VARCHAR"),
        ("rpo_zone", "VARCHAR"),
        ("rpo_grade_band", "VARCHAR"),
        ("rpo_business_hrbp", "VARCHAR"),
        ("rpo_sourcer", "VARCHAR"),
        ("rpo_taggd_pm", "VARCHAR"),
        ("rpo_hiring_agency", "VARCHAR"),
        ("rpo_ijp_referral", "VARCHAR"),
        ("mandate_received_date", "DATETIME"),
        ("intake_date", "DATETIME"),
        ("first_cv_share_date", "DATETIME"),
        ("selection_date_req", "DATETIME"),
        ("loi_date_req", "DATETIME"),
        ("closure_date_req", "DATETIME"),
        ("rpo_stage", "VARCHAR"),
        ("ageing_days", "INTEGER"),
        ("ageing_bracket", "VARCHAR"),
        ("dead_days", "INTEGER"),
        ("tto_days", "INTEGER"),
        ("ttf_days", "INTEGER"),
        ("taggd_fees_amount", "REAL"),
        ("billing_month", "VARCHAR"),
        ("fy_label", "VARCHAR"),
        ("requisition_extras", "TEXT"),
    ]
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(records)")).fetchall()
            cols = {r[1] for r in rows}
            if not cols:
                return
            for col, ddl in alters:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE records ADD COLUMN {col} {ddl}"))
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("records RPO columns migration: %s", e)


def ensure_project_client(db: Session, project: Project) -> Client:
    """Attach a Client row to project if missing (one-to-one bootstrap or new upload)."""
    if project.client_id is not None:
        c = db.query(Client).filter(Client.id == project.client_id).first()
        if c:
            return c
    label = (project.account_name or "").strip()
    if not label:
        fn = (project.filename or "").strip()
        label = os.path.basename(fn) if fn else f"Project {project.id}"
    label = (label or f"Project {project.id}")[:500]
    c = Client(official_name=label)
    db.add(c)
    db.flush()
    project.client_id = c.id
    if not (project.engagement_name or "").strip():
        project.engagement_name = (project.account_name or "").strip() or None
    return c


def backfill_client_project_links(db: Session) -> int:
    """Legacy DB: each project without client_id gets its own Client (merge under one client via PATCH later)."""
    n = 0
    for p in db.query(Project).filter(Project.client_id.is_(None)).all():
        label = (p.account_name or "").strip()
        if not label:
            fn = (p.filename or "").strip()
            label = os.path.basename(fn) if fn else f"Project {p.id}"
        label = (label or f"Project {p.id}")[:500]
        c = Client(official_name=label)
        db.add(c)
        db.flush()
        p.client_id = c.id
        if not (p.engagement_name or "").strip():
            p.engagement_name = (p.account_name or "").strip() or None
        n += 1
    if n:
        db.flush()
    return n


def _ensure_clients_and_project_client_columns():
    """SQLite: clients table via metadata; add client_id + engagement_name on projects if missing."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(projects)")).fetchall()
            cols = {r[1] for r in rows}
            if cols:
                if "client_id" not in cols:
                    conn.execute(text("ALTER TABLE projects ADD COLUMN client_id INTEGER"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_client_id ON projects (client_id)"))
                if "engagement_name" not in cols:
                    conn.execute(text("ALTER TABLE projects ADD COLUMN engagement_name VARCHAR"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_engagement_name ON projects (engagement_name)"))
            conn.commit()
    except Exception as e:
        import logging

        logging.warning("clients/project client_id migration: %s", e)


def backfill_sla_period_starts(db: Session):
    """Populate period_start + canonical reporting_month (YYYY-MM) from legacy labels."""
    from backend.core.sla_period import canonical_month_label, parse_sla_month_label

    updated = 0
    for p in db.query(SLAPerformance).all():
        if p.period_start is not None:
            continue
        d = parse_sla_month_label(p.reporting_month or "")
        if d:
            p.period_start = d
            p.reporting_month = canonical_month_label(d)
            updated += 1
    if updated:
        db.flush()
    return updated


def get_db():
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    try:
        from backend.core.budget_forecast_ledger import migrate_legacy_project_budget_forecast_tables

        migrate_legacy_project_budget_forecast_tables(engine)
    except Exception as e:
        import logging

        logging.warning("legacy project_budgets/project_forecasts migration: %s", e)
    _ensure_clients_and_project_client_columns()
    _ensure_records_rpo_columns()
    _ensure_projects_project_head_column()
    _ensure_user_rbac_and_attribution_columns()
    _ensure_finance_ledger_cash_metrics_audit_columns()
    _ensure_finance_efficiency_scorecard_columns()
    _ensure_project_enterprise_columns()
    _ensure_sla_period_start_column()
    _ensure_finance_efficiency_wl1_column()
    _ensure_finance_efficiency_taggd_joiners_column()
    db = SessionLocal()
    try:
        from .finance_dedupe import dedupe_finance_tables

        dedupe_finance_tables(db)
        n = backfill_sla_period_starts(db)
        if n:
            import logging

            logging.info("backfilled sla period_start on %s rows", n)
        n_c = backfill_client_project_links(db)
        if n_c:
            import logging

            logging.info("backfilled client_id on %s projects", n_c)
        db.commit()
    except Exception as e:
        db.rollback()
        import logging

        logging.warning("finance dedupe / sla backfill on init: %s", e)
    finally:
        db.close()
    _ensure_finance_unique_indexes()
    _ensure_revenue_tracker_indexes()
    try:
        from backend.auth.bootstrap import bootstrap_default_admin

        bootstrap_default_admin()
    except Exception as e:
        import logging

        logging.warning("auth bootstrap: %s", e)


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
