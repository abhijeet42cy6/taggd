"""Optional LLM header mapping for candidate tracker workbooks (Flash, structured output)."""

from __future__ import annotations

import os
from typing import Dict, List, Optional

import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field

from backend.core.candidate_field_synonyms import INGESTABLE_CANDIDATE_FIELDS


class CandidateHeaderMap(BaseModel):
    header_map: Dict[str, str] = Field(
        default_factory=dict,
        description="Map candidate ORM field names to exact Excel header strings.",
    )
    reasoning: str = Field(default="")


class CandidateColumnMapperAgent:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        self.client = instructor.from_gemini(
            client=genai.GenerativeModel(model_name="models/gemini-flash-latest"),
        )

    def map_headers(self, headers: List[str], sample_rows: List[dict]) -> Dict[str, str]:
        allowed = sorted(INGESTABLE_CANDIDATE_FIELDS)
        prompt = f"""
        Headers: {headers}
        Sample rows (truncated): {sample_rows[:3]}

        Map Excel headers to candidate database fields. Use EXACT header strings from Headers.
        Allowed target keys only: {allowed}

        Typical mappings:
        - full_name ← Candidate Name, Name
        - email_id ← EmailID, Email Id
        - contact_no ← Contact No, Contact Number
        - current_stage ← Status, Final Status
        - client_req_id ← Req No, Alt ID
        - position_title ← Position Name, Position Title
        - assigned_recruiter ← Recruiter
        - hiring_manager ← HM Name
        - expected_doj ← DOJ
        """
        result = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You map recruitment tracker columns to a fixed schema."},
                {"role": "user", "content": prompt},
            ],
            response_model=CandidateHeaderMap,
        )
        out: Dict[str, str] = {}
        for k, v in (result.header_map or {}).items():
            if k in INGESTABLE_CANDIDATE_FIELDS and v in headers:
                out[k] = v
        return out
