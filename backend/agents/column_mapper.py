import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import os
from dotenv import load_dotenv

from backend.core.record_field_synonyms import INGESTABLE_RECORD_COLUMNS

load_dotenv()

class ColumnMap(BaseModel):
    mapping: Dict[str, str] = Field(..., description="Map of Universal Key to original Excel Header name.")
    record_field_mapping: Dict[str, str] = Field(
        default_factory=dict,
        description="Map Record ORM field name (snake_case) to exact Excel header for RPO/requisition columns.",
    )
    unmapped_columns: List[str] = Field(..., description="List of headers that don't fit into universal keys but should be kept in JSON.")
    reasoning: str = Field(..., description="Explanation of the mapping logic.")

class ColumnMapperAgent:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        self.client = instructor.from_gemini(
            client=genai.GenerativeModel(
                model_name="models/gemini-flash-latest",
            )
        )

    def map_columns(self, headers: List[str], sample_rows: List[Dict]) -> ColumnMap:
        universal_keys = [
            "candidate_name", "position_title", "status",
            "hiring_manager", "offered_ctc", "joining_date", "creation_date",
            "location", "department",
        ]
        record_keys_sorted = sorted(INGESTABLE_RECORD_COLUMNS)
        record_keys_text = ", ".join(record_keys_sorted)

        prompt = f"""
        Headers: {headers}
        Sample Data: {sample_rows[:3]}

        PART A — Universal keys (candidate/req row): {universal_keys}
        Map at most one Excel header per key. Values must be EXACT header strings from Headers.

        PART B — Requisition / RPO fields (persisted on `records` table). Map any clear matches only.
        Allowed target keys (use exact spelling): {record_keys_text}
        Put them in record_field_mapping as {{ "orm_field_name": "Exact Excel Header" }}.
        Do NOT duplicate a header already used in mapping (universal keys take priority if both apply).
        Typical examples:
        - client_req_id ← Reference ID, Req No, Job Req ID, ABG Req ID, Requisition ID
        - rpo_mandate_status ← Job Requisition Status, Req. Status, Final Status
        - mandate_received_date ← Req Received Date, Mandate Received Date
        - intake_date ← Intake Date, Intake Meeting Date, Job Posting Date
        - first_cv_share_date ← CV shared Date, First CV Share Date, Sourcing Date
        - assigned_recruiter_rpo ← Recruiter, Assigned Recruiter (not the same as hiring_manager if HM is a separate column)
        - rpo_sourcer ← Sourcer, Sourcer Name
        - rpo_bu_sbu ← BU, Business Unit (when it is the org bucket, not the legal company name)
        - experience_years_required ← Years of Experience, Yrs of Experience
        - ctc_budget_lpa ← Max Salary, CTC Budget, Budget (LPA) when numeric budget

        Requirements:
        1. creation_date may be 'Req Date', 'Date Created', 'Opened Date', 'Requisition Created', etc.
        2. joining_date may be 'DOJ', 'Date of Joining', 'Actual DOJ', 'Joining Date'.
        3. offered_ctc may be 'CTC Offered', 'Offered CTC', 'CTC (LPA)', etc.
        4. SYNONYMS across sheets: prefer the header that best matches the majority of rows; note variance in reasoning.
        5. IDENTITY: If Requisition ID / Reference ID exists with empty candidate names (open reqs), still map candidate_name if present; the engine uses Req ID separately — map client_req_id to that ID column when it is the client requisition id.
        6. unmapped_columns: headers with no good target in EITHER mapping or record_field_mapping (they will be stored only in JSON extras on the row).
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a data engineer specializing in recruitment CRM data."},
                {"role": "user", "content": prompt}
            ],
            response_model=ColumnMap,
        )
