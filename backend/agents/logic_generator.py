import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import os
from dotenv import load_dotenv

load_dotenv()

class RevenueLogic(BaseModel):
    python_code: str = Field(..., description="A pure Python function named 'calculate' that takes a dictionary 'row' and returns a dictionary with 'revenue', 'opening_fee', 'closing_fee', and 'status'.")
    explanation: str = Field(..., description="Human readable logic extracted from the contract.")
    variable_dependencies: List[str] = Field(..., description="List of Excel headers required for this calculation.")

class LogicGeneratorAgent:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        self.client = instructor.from_gemini(
            client=genai.GenerativeModel(
                model_name="models/gemini-flash-latest",
            )
        )

    def generate_logic(self, contract_data: str, tracker_headers: List[str], sample_rows: List[Dict]) -> RevenueLogic:
        prompt = f"""
        CONTRACT DATA (Rules):
        {contract_data}
        
        TRACKER HEADERS:
        {tracker_headers}
        
        SAMPLE TRACKER ROWS:
        {sample_rows[:3]}
        
        TASK:
        Generate a Python function `calculate(row: dict) -> dict` that calculates the revenue for a single row.
        
        Constraints:
        1. Always return a dict: {{'revenue': float, 'opening_fee': float, 'closing_fee': float, 'status': str}}
        2. Handle strings like '10,00,000' by converting them to floats safely.
        3. RESILIENCE: If critical data (like 'Status', 'Hired Count', or 'Salary') appears under different header names in different samples or sheets, use coalescing patterns: `val = row.get('Header A') or row.get('Header B')`.
        4. LOGIC GUARD: If revenue is calculated as 0.0 because the position is 'Cancelled', 'On Hold', or 'Void', you MUST also set `opening_fee` and `closing_fee` to 0.0 to prevent global status mistagging.
        5. PERFORMANCE: When checking statuses or bands, always use `.strip().lower()` (e.g., `row.get('Status').strip().lower() == 'joined'`) to handle trailing spaces or case differences in Excel.
        6. If revenue is 0.0 because the position is still open or in progress, return a status representing the current recruiting stage (e.g., 'Offer Stage', 'Interview', 'Sourcing', 'In Progress').
        7. Always return a 'status' string. If the position is on hold or canceled, return status: 'On Hold' or 'Cancelled'.
        8. If an opening fee is applicable (even if no one is hired yet), ensure opening_fee is returned so the position is marked as 'ACTIVE' in the system.
        9. SANDBOX: Do not use import os, sys, subprocess, open(), or file I/O. If you need helpers, you may use only: import math, import re, import datetime (no other imports).
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a senior financial developer. You write robust, clean Python code for financial calculations."},
                {"role": "user", "content": prompt}
            ],
            response_model=RevenueLogic,
        )
