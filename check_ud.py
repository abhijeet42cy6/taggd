from backend.db.database import SessionLocal, Project
db = SessionLocal()
p = db.query(Project).filter(Project.filename == "UD Trcuks Position and Candidate Tracker (2).xlsx").first()
if p:
    print("--- LOGIC FOR UD TRUCKS ---")
    print(p.revenue_logic_code)
    print("--- MAPPING FOR UD TRUCKS ---")
    print(p.column_mapping)
else:
    print("UD Trucks not found in DB")
db.close()
