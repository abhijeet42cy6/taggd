import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

class SheetClassification(BaseModel):
    tracker_sheet: str = Field(..., description="The primary data sheet name (backward compatibility).")
    data_sheets: List[str] = Field(..., description="List of all sheets containing position/hiring tracking data.")
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
        1. ALL 'Position Tracker' or 'Data' sheets (can be multiple, e.g., 'Open Positions', 'Closed Positions'). 
           List these in 'data_sheets'. Pick the most prominent one for 'tracker_sheet'.
        2. The 'Contractual' sheet (contains percentage fees, band-wise fees, commercial terms).
        
        Requirements:
        - If a sheet contains keywords like 'Open', 'Closed', 'Hired', 'Tracker', 'Data', 'Recruitment', it's a data sheet.
        - If a sheet contains keywords like 'Contract', 'Commercial', 'Annexure', 'Fees', 'Logic', it's a logic sheet.
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are an expert recruitment data analyst. You identify the structure of recruitment trackers."},
                {"role": "user", "content": prompt}
            ],
            response_model=SheetClassification,
        )
