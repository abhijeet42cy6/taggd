import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import os
from dotenv import load_dotenv

load_dotenv()

class ColumnMap(BaseModel):
    mapping: Dict[str, str] = Field(..., description="Map of Universal Key to original Excel Header name.")
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
            "location", "department"
        ]
        
        prompt = f"""
        Headers: {headers}
        Sample Data: {sample_rows[:3]}
        
        Map the headers to these Universal Keys: {universal_keys}
        
        Requirements:
        1. Identify which header corresponds to which key. 
           Hint: 'creation_date' may be 'Req Date', 'Opened Date', 'Requisition Created', etc.
        2. SYNONYMS: If you see two headers that represent the same concept in different sheets (e.g. 'Reference ID' and 'Job ID'), map the most common one but note the variance in reasoning.
        3. IDENTITY COALESCING: If a file contains a 'Requisition ID' or 'Reference ID' but frequently has empty 'Candidate Name' columns (common in open positions), ensure the ID header is clearly identified so it can be used as an identity fallback in the processing engine.
        4. If a key doesn't have a clear match, leave it out of the mapping.
        5. List all other headers in 'unmapped_columns'.
        """
        
        return self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a data engineer specializing in recruitment CRM data."},
                {"role": "user", "content": prompt}
            ],
            response_model=ColumnMap,
        )
