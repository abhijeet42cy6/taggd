from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

import os

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///./revenue_generator.db")
SQLALCHEMY_DATABASE_URL = DB_PATH

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, unique=True, index=True)
    tracker_sheet = Column(String)
    contract_sheet = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Store the generated mapping and calculation logic for this project
    column_mapping = Column(JSON) # Map of Universal Key -> Excel Header
    revenue_logic_code = Column(Text) # The synthesized Python function
    logic_explanation = Column(Text)  # Natural language explanation of the revenue logic
    
    records = relationship("Record", back_populates="project")

class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    
    # --- Universal Keys (Robust standard columns) ---
    candidate_name = Column(String, index=True)
    position_title = Column(String)
    status = Column(String, index=True) # Joined, Offered, etc.
    hiring_manager = Column(String)
    offered_ctc = Column(Float)
    joining_date = Column(DateTime)
    location = Column(String)
    department = Column(String)
    
    # --- Flexible Storage ---
    # Stores ALL other attributes from the excel row as JSON
    additional_attributes = Column(JSON)
    
    # --- Calculation Results ---
    # Stores the results of the revenue generated code
    # e.g., {"revenue": 150000, "opening_fee": 50000, "closing_fee": 100000, "status": "calculated"}
    revenue_results = Column(JSON)
    
    project = relationship("Project", back_populates="records")

def init_db():
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
