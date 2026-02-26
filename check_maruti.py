from backend.db.database import SessionLocal, Project
db = SessionLocal()
p = db.query(Project).filter(Project.filename == "Maruti.xlsx").first()
if p:
    print("--- LOGIC FOR MARUTI ---")
    print(p.revenue_logic_code)
    print("--- MAPPING FOR MARUTI ---")
    print(p.column_mapping)
else:
    print("Maruti not found in DB")
db.close()
