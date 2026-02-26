import pandas as pd
from backend.agents.sheet_identifier import SheetIdentifierAgent
import os

excel_file = "/Users/arjun/Software/tgddata/excel_files/Birla_Paint.xlsx"
xl = pd.ExcelFile(excel_file)
sheet_names = xl.sheet_names

print(f"File: {os.path.basename(excel_file)}")
print(f"All Sheets: {sheet_names}")

agent = SheetIdentifierAgent()
result = agent.identify_sheets(sheet_names)

print("\n--- Agent Identification Result ---")
print(f"Tracker Sheet: {result.tracker_sheet}")
print(f"Contract Sheet: {result.contract_sheet}")
print(f"Confidence: {result.confidence}")
print(f"Reasoning: {result.reasoning}")
