import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

class SheetClassification(BaseModel):
    tracker_sheet: str = Field(..., description="The name of the sheet likely containing position/hiring tracking data.")
    contract_sheet: str = Field(..., description="The name of the sheet likely containing commercial terms, fees, or contracts.")
    reasoning: str = Field(..., description="Explanation of why these sheets were chosen.")
    confidence: float = Field(..., description="Confidence score between 0 and 1.")

class SheetIdentifierAgent:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        self.client = instructor.from_gemini(
            client=genai.GenerativeModel(
                model_name="models/gemini-flash-latest",
            )
        )

    def identify_sheets(self, sheet_names: List[str]) -> SheetClassification:
        prompt = f"""
        Given the following list of Excel sheet names:
        {sheet_names}
        
        Identify:
        1. The 'Position Tracker' sheet (contains candidate lists, statuses, CTCs).
        2. The 'Contractual' sheet (contains percentage fees, band-wise fees, commercial terms).
        
        If there are multiple trackers, choose the most 'active' or 'final' one.
        If a sheet is named 'Contract' or 'Contractual', it is highly likely the contract sheet.
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are an expert recruitment data analyst."},
                {"role": "user", "content": prompt}
            ],
            response_model=SheetClassification,
        )
