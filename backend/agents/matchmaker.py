import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import os
from dotenv import load_dotenv

load_dotenv()

class MatchResult(BaseModel):
    excel_name: str
    matched_project_id: Optional[int]
    confidence: float
    reasoning: str

class MatchList(BaseModel):
    matches: List[MatchResult]

class MatchmakerAgent:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        self.client = instructor.from_gemini(
            client=genai.GenerativeModel(
                model_name="models/gemini-flash-latest",
            )
        )

    def match_clients(self, excel_names: List[str], db_projects: List[Dict]) -> MatchList:
        """
        Maps names found in Excel (e.g. 'Honeywell') to DB objects (e.g. {'id': 1, 'filename': 'HPE Tracker.xlsx'})
        """
        prompt = f"""
        EXCEL CLIENT NAMES:
        {excel_names}
        
        DATABASE PROJECTS:
        {db_projects}
        
        TASK:
        Match each Excel name to a Database Project. 
        Note: The Excel name might be a client name (Honeywell) while DB name is a filename (HPE Tracker.xlsx). 
        Use your knowledge of corporate names to find matches.
        If NO clear match exists, set matched_project_id to null.
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a master of corporate entity reconciliation. You link client names to project files."},
                {"role": "user", "content": prompt}
            ],
            response_model=MatchList,
        )
