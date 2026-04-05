import sys
import os
import instructor
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session

from dotenv import load_dotenv

# Add project root to path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

load_dotenv()

from backend.db.database import SessionLocal, Project, init_db

class AccountNameIdentification(BaseModel):
    filename: str
    suggested_account_name: Optional[str] = Field(description="The clean name of the client found in the filename, or None if unclear.")

class AccountList(BaseModel):
    items: List[AccountNameIdentification]

class DataBackfiller:
    def __init__(self):
        phi_api_key = os.getenv("GEMINI_API_KEY")
        if not phi_api_key:
            raise Exception("GEMINI_API_KEY not found in environment")
        genai.configure(api_key=phi_api_key)
        self.model = instructor.from_gemini(
            client=genai.GenerativeModel(model_name="models/gemini-1.5-flash-latest")
        )

    def backfill(self):
        print("--- Starting Project Account Name Backfill ---")
        db: Session = SessionLocal()
        
        try:
            # 1. Get projects with no account names
            legacy_projects = db.query(Project).filter(
                (Project.account_name == None) | (Project.account_name == '')
            ).all()
            
            if not legacy_projects:
                print("No legacy projects found without account names.")
                return

            filenames = [p.filename for p in legacy_projects]
            print(f"Analyzing {len(filenames)} files: {filenames}")

            # 2. Use AI to extract clear names from filenames
            prompt = f"""
            Identify the core CLIENT/ACCOUNT name from these filenames.
            FILENAMES: {filenames}
            
            Rules:
            - Strip 'Tracker', '.xlsx', 'Position', 'Updated', etc.
            - Ensure names match common versions (e.g., 'M&M' instead of 'Mahindra').
            - If it's plural (Trackers), normalize it (Honeywell).
            """
            
            results = self.model.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                response_model=AccountList
            )

            # 3. Apply updates
            name_map = {res.filename: res.suggested_account_name for res in results.items}
            
            updated_count = 0
            for proj in legacy_projects:
                clean_name = name_map.get(proj.filename)
                if clean_name:
                    print(f"Updating: ID {proj.id} | '{proj.filename}' -> '{clean_name}'")
                    proj.account_name = clean_name
                    updated_count += 1
                else:
                    print(f"Skipping: ID {proj.id} | '{proj.filename}' (No clear account name)")
            
            db.commit()
            print(f"\nSuccessfully backfilled {updated_count} account names.")

        except Exception as e:
            db.rollback()
            print(f"Backfill error: {str(e)}")
            import traceback
            traceback.print_exc()
        finally:
            db.close()

if __name__ == "__main__":
    backfiller = DataBackfiller()
    backfiller.backfill()
