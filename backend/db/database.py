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
    """Platform login: admin | executive | manager (executive & manager use user_project_assignments)."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

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

class Project(Base, AuditMixin):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True) # Removed unique=True to allow multiple accounts from one manifest file
    tracker_sheet = Column(String)
    contract_sheet = Column(String)
    
    # Enhanced Enterprise Metadata
    account_name = Column(String, index=True)
    charge_code = Column(String, index=True)  # e.g. TRP0001T00NM1GIA — client / charge identifier
    account_status = Column(String)  # e.g. Active, Not Active
    region = Column(String)
    sub_region = Column(String)  # e.g. West 1 (distinct from category / TARA bucket)
    practice_head = Column(String)
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
    budgets = relationship("ProjectBudget", back_populates="project")
    forecasts = relationship("ProjectForecast", back_populates="project")
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

class ProjectBudget(Base, AuditMixin):
    __tablename__ = "project_budgets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    fiscal_year = Column(String) # e.g. "FY'26"
    q1 = Column(Float, default=0.0)
    q2 = Column(Float, default=0.0)
    q3 = Column(Float, default=0.0)
    q4 = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    raw_project_name = Column(String) # The original name from Excel
    
    project = relationship("Project", back_populates="budgets")

class ProjectForecast(Base, AuditMixin):
    __tablename__ = "project_forecasts"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    month_year = Column(DateTime) # The specific month
    metric_name = Column(String) # e.g. "MMF", "Joiner", "Opening Fee"
    value = Column(Float, default=0.0)
    raw_project_name = Column(String) # The original name from Excel
    
    project = relationship("Project", back_populates="forecasts")

class Record(Base, AuditMixin):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    # --- Universal Keys (Robust standard columns) ---
    candidate_name = Column(String, index=True)
    position_title = Column(String)
    status = Column(String, index=True) # Joined, Offered, etc.
    hiring_manager = Column(String)
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
    
    project = relationship("Project", back_populates="records")

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
    
    project = relationship("Project", back_populates="finance_ledger")

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
    
    project = relationship("Project", back_populates="finance_cashflow")

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
    actual_ppc = Column(Float, default=0.0) # Actual Personnel Cost
    
    project = relationship("Project", back_populates="finance_kpis")


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
