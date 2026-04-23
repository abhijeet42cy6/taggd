"""
Closed-list / enum values for Excel upload templates — aligned with backend + app UI.

Source references (do not import heavy modules like `main`):
- `backend.auth.profile` — roles
- `backend.main` (documented) — RECORD_SOURCE_JOINER_TYPES
- `backend.core.finance_billing_workflow_core` — billing validation_status
- `backend.core.revenue_weekly_submission_core` — weekly pack status
- `backend.core.finance_planning_categories` — metric_category
- `backend.core.candidate_master_mgmt` — link_source
- `frontend` RequisitionCreateDrawer, Transitions, Tasks, FinanceValidation — labels
"""
from __future__ import annotations

from typing import Any

from backend.core.candidate_master_mgmt import (
    LINK_SOURCE_AUTO,
    LINK_SOURCE_MANUAL,
    LINK_SOURCE_MIGRATION,
)
from backend.core.finance_billing_workflow_core import (
    ST_CFO_PENDING,
    ST_DISPUTED,
    ST_DRAFT,
    ST_FULLY_APPROVED,
    ST_JUNIOR_APPROVED,
    ST_REJECTED,
    ST_SUBMITTED,
    ST_UNDER_REVIEW,
)
from backend.core.finance_planning_categories import PLANNING_FORECAST_CATEGORIES
from backend.core.revenue_weekly_submission_core import (
    ST_APPROVED,
    ST_CHANGES_REQUESTED,
    ST_DRAFT as RS_ST_DRAFT,
    ST_REJECTED as RS_ST_REJECTED,
    ST_SUBMITTED as RS_ST_SUBMITTED,
    ST_UNDER_REVIEW as RS_ST_UNDER_REVIEW,
)
from backend.auth.profile import CANONICAL_ROLES, LEGACY_ROLE_ALIASES

# --- Roles (stored in DB: canonical + legacy aliases) ---
USER_ROLE_OPTIONS: list[str] = sorted(
    set(CANONICAL_ROLES) | set(LEGACY_ROLE_ALIASES.keys()),
    key=str.lower,
)

# backend/main.py RECORD_SOURCE_JOINER_TYPES
RECORD_SOURCE_JOINER_OPTIONS: list[str] = sorted(
    {
        "taggd_rpo",
        "taggd_direct",
        "nontaggd_employee_referral",
        "nontaggd_internal_job_portal",
        "nontaggd_campus",
        "nontaggd_transferred",
    }
)

# RequisitionCreateDrawer
GLOBAL_STATUS_OPTIONS: list[str] = list(
    ("ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "UNPROCESSED", "CANCELLED")
)

# Common pipeline + analytics spellings
RECORD_STATUS_OPTIONS: list[str] = [
    "Open",
    "Joined",
    "Offered",
    "Screening",
    "Interview",
    "Canceled",
    "Cancelled",
    "On Hold",
    "Closed",
    "Rejected",
]

# Transitions.tsx STATUSES
PROJECT_TRANSITION_STATUS_OPTIONS: list[str] = [
    "draft",
    "in_progress",
    "soft_launched",
    "live",
    "delayed",
    "cancelled",
]

RPO_AGEING_BRACKET_OPTIONS: list[str] = ["0-2", "3-5", "6-9", ">10", "No data", "N/A"]

# core/finance_planning_categories + legacy ledger lines
FINANCE_METRIC_CATEGORY_OPTIONS: list[str] = sorted(
    {"Revenue", "Contribution Margin", "Cost", *PLANNING_FORECAST_CATEGORIES},
    key=str.lower,
)

# finance_billing_workflow_core
BILLING_VALIDATION_STATUS_OPTIONS: list[str] = [
    ST_DRAFT,
    ST_SUBMITTED,
    ST_UNDER_REVIEW,
    ST_DISPUTED,
    ST_REJECTED,
    ST_JUNIOR_APPROVED,
    ST_CFO_PENDING,
    ST_FULLY_APPROVED,
]

# revenue weekly submission
REVENUE_WEEKLY_STATUS_OPTIONS: list[str] = [
    RS_ST_DRAFT,
    RS_ST_SUBMITTED,
    RS_ST_UNDER_REVIEW,
    ST_APPROVED,
    ST_CHANGES_REQUESTED,
    RS_ST_REJECTED,
]

# FinanceValidation STATUS_CHIPS + common treasury labels
PAYMENT_MODE_OPTIONS: list[str] = [
    "NEFT",
    "RTGS",
    "IMPS",
    "UPI",
    "Cheque",
    "Cash",
    "Card",
    "Other",
]

GST_RECONCILIATION_OPTIONS: list[str] = [
    "pending",
    "matched",
    "unmatched",
    "not_applicable",
    "disputed",
]

BANK_MATCH_STATUS_OPTIONS: list[str] = [
    "unmatched",
    "matched",
    "partial",
    "manual",
    "review",
]

# Tasks.tsx
TASK_STATUS_OPTIONS: list[str] = ["open", "in_progress", "blocked", "done", "cancelled"]
TASK_PRIORITY_OPTIONS: list[str] = ["p0", "p1", "p2", "p3"]
TASK_ASSIGNEE_ROLE_OPTIONS: list[str] = ["assignee", "watcher"]
LINKED_RESOURCE_TYPE_OPTIONS: list[str] = [
    "project",
    "requisition",
    "meeting",
    "vendor_license",
    "ingestion_batch",
    "candidate",
    "platform_task",
]

# SLA / WFM
SLA_RAG_STATUS_OPTIONS: list[str] = ["Green", "Amber", "Red", "Grey", "N/A", "RAG_G", "RAG_A", "RAG_R"]
WFM_GAP_STATUS_OPTIONS: list[str] = ["Approved", "Open", "Closed", "On Hold"]
WFM_HIRING_TYPE_OPTIONS: list[str] = ["New", "Replacement"]
WFM_LEVEL_OPTIONS: list[str] = ["WL1", "WL2", "WL3", "WL4", "WL5"]

# Ingestion (ingestion_audit + main usage)
INGESTION_KIND_OPTIONS: list[str] = [
    "express",
    "pro_inspect",
    "pro_confirm",
    "sla",
    "wfm",
    "finance",
    "revenue_trackers",
]
INGESTION_STATUS_OPTIONS: list[str] = ["success", "error", "partial", "pending"]

# Client / project
CLIENT_LIFECYCLE_OPTIONS: list[str] = ["prospect", "active"]
PROJECT_ORG_UNIT_KIND: list[str] = ["business_unit", "sub_business_unit", ""]
ACCOUNT_STATUS_OPTIONS: list[str] = ["Active", "Not Active", "Dormant"]

# candidate_master_links
CANDIDATE_LINK_SOURCE_OPTIONS: list[str] = [LINK_SOURCE_AUTO, LINK_SOURCE_MANUAL, LINK_SOURCE_MIGRATION]

# period_type: DB default weekly only
PERIOD_TYPE_OPTIONS: list[str] = ["weekly"]

# TDS / certificates (loose)
TDS_CERTIFICATE_TYPE_OPTIONS: list[str] = ["16A", "16B", "other"]

# bool as strings common for import
BOOLEAN_EXCEL_OPTIONS: list[str] = ["1", "0"]

# (table_name, column_name) -> list[str]
# Use SQLAlchemy __tablename__ keys.
DROPDOWNS_BY_TABLE: dict[str, dict[str, list[str]]] = {
    "users": {
        "role": USER_ROLE_OPTIONS,
    },
    "clients": {
        "lifecycle_state": CLIENT_LIFECYCLE_OPTIONS,
    },
    "projects": {
        "org_unit_kind": [x for x in PROJECT_ORG_UNIT_KIND if x],
        "account_status": ACCOUNT_STATUS_OPTIONS,
    },
    "project_transitions": {
        "status": PROJECT_TRANSITION_STATUS_OPTIONS,
    },
    "records": {
        "source_joiner_type": [""] + list(RECORD_SOURCE_JOINER_OPTIONS),  # optional
        "global_status": GLOBAL_STATUS_OPTIONS,
        "status": RECORD_STATUS_OPTIONS,
        "ageing_bracket": RPO_AGEING_BRACKET_OPTIONS,
    },
    "candidates": {
        "global_status": GLOBAL_STATUS_OPTIONS,
        "offer_acceptance": ["Yes", "No", "Accepted", "Declined", "Pending", ""],
        "joining_status": ["Yet to join", "Joined", "No show", "Deferred", "Withdrawn", ""],
        "checkin_30_day": ["Met", "Not met", "N/A", ""],
        "checkin_60_day": ["Met", "Not met", "N/A", ""],
        "checkin_90_day": ["Met", "Not met", "N/A", ""],
    },
    "candidate_master_links": {
        "link_source": CANDIDATE_LINK_SOURCE_OPTIONS,
    },
    "platform_tasks": {
        "status": TASK_STATUS_OPTIONS,
        "priority": [""] + TASK_PRIORITY_OPTIONS,
        "linked_resource_type": [""] + LINKED_RESOURCE_TYPE_OPTIONS,
    },
    "task_assignees": {
        "assignee_role": TASK_ASSIGNEE_ROLE_OPTIONS,
    },
    "platform_meetings": {
        "meeting_mode": ["Virtual", "In-person", "Hybrid", "Phone", ""],
    },
    "meeting_action_items": {
        "status": ["open", "in_progress", "done", "cancelled", "deferred", ""],
    },
    "finance_monthly_ledger": {
        "metric_category": FINANCE_METRIC_CATEGORY_OPTIONS,
    },
    "revenue_weekly_submission": {
        "status": REVENUE_WEEKLY_STATUS_OPTIONS,
        "period_type": PERIOD_TYPE_OPTIONS,
    },
    "finance_billing_workflow": {
        "validation_status": BILLING_VALIDATION_STATUS_OPTIONS,
        "payment_mode": [""] + PAYMENT_MODE_OPTIONS,
        "gst_reconciliation_status": [""] + GST_RECONCILIATION_OPTIONS,
        "bank_match_status": [""] + BANK_MATCH_STATUS_OPTIONS,
        "partial_payment": BOOLEAN_EXCEL_OPTIONS,
        "cfo_sign_off_acknowledged": BOOLEAN_EXCEL_OPTIONS,
    },
    "finance_payment_receipts": {
        "payment_mode": [""] + PAYMENT_MODE_OPTIONS,
        "partial": BOOLEAN_EXCEL_OPTIONS,
    },
    "ingestion_events": {
        "kind": INGESTION_KIND_OPTIONS,
        "status": INGESTION_STATUS_OPTIONS,
    },
    "project_contracts": {
        "mmf_applicable": BOOLEAN_EXCEL_OPTIONS,
        "opening_fee_applicable": BOOLEAN_EXCEL_OPTIONS,
    },
    "wfm_resource_gaps": {
        "status": WFM_GAP_STATUS_OPTIONS,
        "hiring_type": WFM_HIRING_TYPE_OPTIONS,
        "designation_level": WFM_LEVEL_OPTIONS,
    },
    "sla_performances": {
        "rag_status": SLA_RAG_STATUS_OPTIONS,
    },
    "finance_tds_certificates": {
        "certificate_type": TDS_CERTIFICATE_TYPE_OPTIONS,
    },
    "revenue_visibility_snapshot": {
        "status": ["", "ok", "at_risk", "critical", "n/a"],
    },
}

def get_dropdown_options(
    model: Any,
    column_name: str,
    column_type: Any,
) -> list[str] | None:
    """Return a list of allowed values for a data-validation dropdown, or None to skip."""
    from sqlalchemy import Boolean

    table = model.__table__.name
    per = DROPDOWNS_BY_TABLE.get(table, {})
    if column_name in per:
        return [x for x in per[column_name] if x is not None]
    if isinstance(column_type, Boolean):
        return list(BOOLEAN_EXCEL_OPTIONS)
    return None
