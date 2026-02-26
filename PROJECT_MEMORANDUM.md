# Project Memorandum: Agentic Revenue Generator

## 1. Project Overview
The **Agentic Revenue Generator** is a sophisticated data processing pipeline designed to handle highly dynamic recruitment data. It uses Large Language Model (LLM) agents to bridge the gap between messy, unstandardized Excel trackers and structured financial reporting.

**Core Objective**: Transform various "Position Trackers" into a unified "Revenue Dashboard" by dynamically interpreting the data structure and contract logic of each unique file.

---

## 2. The Dynamic Data Challenge
Recruitment trackers (Excel) vary wildly between clients and time periods.
- **Varying Headers**: One file uses `CTC`, another `Annual Gross`, another `Offered Sal`.
- **Varying Sheet Names**: `Open Position`, `Active_Track`, `Hiring_Sheet`, etc.
- **Complex Logic**: Revenue calculation depends on a separate "Contractual Sheet" which defines tiers, opening fees, and closing fees based on bands or salary brackets.

---

## 3. Four-Step Agentic Pipeline

### Step 1: Semantic Sheet Identification
- **Input**: A list of strings (all sheet names in the workbook).
- **Agent Action**: The agent classifies which sheet is the **Position Tracker** (source data) and which is the **Contractual Sheet** (logic source).
- **Output**: JSON containing the identified sheet names with a "confidence score" and reasoning.

### Step 2: Semantic Data Mapping
- **Input**: 20 random rows of data from the identified Position Tracker.
- **Agent Action**: The agent maps columns to internal "Universal Keys" (e.g., `CANDIDATE_NAME`, `OFFERED_SALARY`, `JOINING_DATE`, `STATUS`). 
- **Handling Messiness**: It identifies if dates are in ISO format, strings, or Excel integers and handles null-value scenarios.

### Step 3: Calculation Logic Synthesis
- **Input**: 
    1. Entire **Contractual Sheet** contents.
    2. Column **Headers** of the Position Tracker.
- **Agent Action**: The agent acts as a "Financial Architect." It reads the contract terms (e.g., "15% of CTC for Band 4") and writes a **Python function** `calculate_revenue(row)` tailored specifically for that file.
- **Safety**: The generated code is validated for syntax before execution.

### Step 4: Batch Execution & Persistence
- **Action**: The system loads the tracker row-by-row (using Pandas chunks for large files) and applies the synthesized logic.
- **Output**:
    - **Calculated Values**: Total Revenue, Opening Fees, Closing Fees.
    - **KPIs**: Position Status (Open/Closed), Closure Rate.
- **Storage**: Results are persisted in a **SQLite** database.

---

## 4. Technical Architecture

### Backend (Python/FastAPI)
- **Data Engine**: `Pandas` for robust Excel tabular handling.
- **Agent Orchestration**: LLMs (GPT-4o or Claude 3.5) using **Instructor** for guaranteed JSON schemas.
- **Sandbox**: A controlled execution environment for the generated revenue logic.

### Storage (SQLite)
- **`raw_data`**: Stores the original rows for traceability.
- **`calculated_revenue`**: Stores the output of the agentic logic.
- **`metadata`**: Records which agent version and logic snippet was used for each file.

### UI (React + Vite)
- **Aesthetic**: Premium Dark Mode / Glassmorphism.
- **Visuals**: 
    - **Agent Reasoning Console**: A log showing the agent's high-level thoughts.
    - **Stats Dashboard**: Reanimated count-ups for total revenue and interactive charts.

---

## 5. Development Roadmap
1.  **Phase 1 (Foundation)**: Setup FastAPI, SQLite schema, and Excel reading utilities.
2.  **Phase 2 (Agent Core)**: Implement Step 1 & 2 (Sheet Identification and Mapping).
3.  **Phase 3 (Synthesis)**: Implement Step 3 (Calculated Code Generation).
4.  **Phase 4 (Execution & UI)**: Build the batch processor and the React dashboard.

---

## 6. Memory & Traceability
This system is designed to "remember" its decisions. Every time an agent identifies a column or writes a formula, it is saved in the database. If the user corrects a mapping, the agent learns from that correction for future files in the same project.
