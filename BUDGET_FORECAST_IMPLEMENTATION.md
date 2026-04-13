# Budget & Forecast Implementation Detailed Report

This document outlines the architectural and code-level changes implemented to support the **Top-Down Planning (Budget & Forecast)** module in the Agentic Revenue Generator.

## 🏛 Backend Architecture

The implementation follows a **Decoupled Planning Architecture**, ensuring that strategic targets (Budgets/Forecasts) are stored separately from operational performance (Trackers).

### 1. Database Schema Expansion (`backend/db/database.py`)

Two new "Side-Car" tables were added to store planning data without affecting existing project records:

- `**ProjectBudget`**: Stores quarterly and annual targets.
  - `id`, `project_id`, `fiscal_year`, `q1`, `q2`, `q3`, `q4`, `total`
- `**ProjectForecast`**: Stores monthly predictive data.
  - `id`, `project_id`, `month_year` (DateTime), `metric_name` (e.g., MMF, Joiner Fee), `value`

### 2. Matchmaker Agent (`backend/agents/matchmaker.py`)

A new AI agent was developed to reconcile client names between static planning sheets and the dynamic Project Vault.

- **Logic**: Uses Google Gemini to map names like "Honeywell" or "Siemens" to their respective database objects (e.g., `HPE Tracker.xlsx`) based on context and institutional knowledge.
- **Output**: A high-confidence mapping of Excel names to Internal Project IDs.

### 3. Integrated Pipeline (`backend/main.py`)

A dedicated endpoint `/api/upload/budget-forecast` was added to handle the specific two-sheet structure of `Book19.xlsx`:

- **Unpivoting Logic**: The "Forecast Template" uses a horizontal month-based layout (April to March). The backend automatically "unpivots" these columns into vertical time-series records.
- **Forward Fill (ffill)**: Handles Excel-specific formatting where project names are only present in a single merged cell for multiple rows.
- **Atomic Transactions**: Each upload clears existing planning data for that specific project/year before inserting new data, ensuring no duplicates.

---

## 💻 Code Additions & Changes

### Backend Components


| File                           | Change Type  | Description                                                                         |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------- |
| `backend/db/database.py`       | **Modified** | Added `ProjectBudget` and `ProjectForecast` models with relationships to `Project`. |
| `backend/agents/matchmaker.py` | **New**      | Created `MatchmakerAgent` for AI-based client name reconciliation.                  |
| `backend/main.py`              | **Modified** | Added pipeline endpoint, integrated Matchmaker, and implemented unpivoting logic.   |


### Frontend Components


| File                                    | Change Type  | Description                                                                    |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `frontend/src/pages/BudgetForecast.tsx` | **New**      | Implemented a premium planning dashboard with upload and reconciliation views. |
| `frontend/src/App.tsx`                  | **Modified** | Registered the `/budget-forecast` route for navigation.                        |
| `frontend/src/components/Sidebar.tsx`   | **Modified** | Added "Budget & Forecast" with `TrendingUp` icon to the primary navigation.    |


---

## 🔄 Data Workflow

1. **Ingestion**: User uploads a multi-sheet planner.
2. **Mapping**: Matchmaker Agent identifies which client names match which Project Vault entries.
3. **Transformation**: Horizontal monthly columns are rotated into a vertical DB-friendly format.
4. **Sync**: Data is tagged with `project_id` and stored for actual-vs-target reporting.

---

*Status: Implementation Complete & Verified.*