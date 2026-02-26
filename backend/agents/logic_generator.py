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
        3. Use the exact header names from the tracker to access data.
        4. PERFORMANCE: When checking statuses or bands, always use `.strip().lower()` (e.g., `row.get('Status').strip().lower() == 'joined'`) to handle trailing spaces or case differences in Excel.
        5. If logic cannot be applied to a row (e.g. status not 'Joined'), return revenue=0 and a status message.
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a senior financial developer. You write robust, clean Python code for financial calculations."},
                {"role": "user", "content": prompt}
            ],
            response_model=RevenueLogic,
        )
