from backend.db.database import SessionLocal, Project
db = SessionLocal()
p = db.query(Project).filter(Project.filename == "Vertiv Position Tracker (2).xlsx").first()
if p:
    print("--- LOGIC FOR VERTIV ---")
    print(p.revenue_logic_code)
    print("--- MAPPING FOR VERTIV ---")
    print(p.column_mapping)
else:
    print("Vertiv not found in DB")
db.close()
