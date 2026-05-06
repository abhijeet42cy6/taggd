# Data Integrity Shield: Deployment Details

This document outlines the architectural fixes deployed to solve the core logical fallacies identified in the RevAgent data layer. These changes transform the platform from a "fragile" position-based system to a robust "semantic" SaaS platform.

## 1. Stable Semantic Identity (The "Anti-Sync Rot" Fix)
**Change**: Modified the fingerprinting algorithm in `backend/core/processor.py`.
- **Old Logic**: Identity was `SHA256(PID + Row Index + CTC + Date)`.
- **New Logic**: Identity is `SHA256(PID + Candidate Name + ID + Title + Date + CTC + Location)`.
- **System Impact**: 
    - **Stability**: The system is now **position-agnostic**. You can sort, filter, or insert new rows into Excel trackers without breaking the sync. 
    - **Deduplication**: Identical candidates across different sheets are now correctly identified and unified instead of being treated as different records based on their row number.

## 2. Scoped Budget/Forecast Data Protection
**Change**: Updated the `/api/upload/budget-forecast` endpoint in `backend/main.py`.
- **Old Logic**: A global `truncate` was performed on the entire budget table before every upload.
- **New Logic**: A **scoped delete** is performed only for the Project IDs present in the new Excel file.
- **System Impact**:
    - **Safety**: You can now manage a multi-project portfolio incrementally. Updating the budget for "Project A" no longer wipes out the budget for "Project B."
    - **Portfolio Scaling**: Supports hundreds of independent trackers without catastrophic data loss during minor updates.

## 3. The "Lacs to INR" Magnitude Sieve (Global Parity)
**Change**: Unified the unit representation across both **Live Trackers** (`processor.py`) and **Finance Master Scripts** (`ingest_finance.py`).
- **Logic (`ingest_finance.py`)**: For ledger, cash-flow, and most KPI currency fields, if **`0 < |value| < 2000`**, the value is multiplied by **`100_000`** (treated as **Lacs** → absolute INR). Boundary **`2000`** is exclusive — exactly **2000** is not scaled by this branch.
- **Caveats**: Amounts already in **INR** but with magnitude **under 2000** may be scaled incorrectly. Amounts expressed as **Lacs** but **≥ 2000** may be stored **without** scaling. See **`docs/DATA_INGESTION_RUNBOOK.md` §6.2** for full notes.
- **Exceptions**: Headcount-style KPI fields (`approved_headcount`, `actual_headcount_finance`, `actual_headcount_wl1`, `taggd_joiners`) skip the multiplier on their sheets.
- **Coverage**: Not every Excel tab in a finance workbook maps into ingest (e.g. **`PPC_Actual`** cost and **`Revenue_Adjustment`** are not wired unless aliases/specs are extended — runbook §6.4).
- **System Impact**:
    - **Global Financial Parity**: You can compare **budgeted** ledger rows from the finance master against tracker-derived revenue **when both sides use comparable units** and sheets are ingested.
    - **Dashboard Consistency**: Ingested `finance_monthly_ledger` / cash-flow / KPI rows aim for **absolute INR** after the heuristic; validate outliers against source files.

## 4. Master SLA Header Sieve
**Change**: Strengthened the data filter in `backend/scripts/ingest_sla.py`.
- **Logic**: Explicitly blocks known header keywords and instruction strings (e.g., "Metrics to be picked...") from the ingestion stream.
- **System Impact**:
    - **Data Purity**: Eliminates "Ghost Metrics" from the dashboard.
    - **UI Stability**: Prevents `NaN` or "String-as-Number" errors in the SLA Compliance Matrix.

---

### Verification Checklist
- [x] Sorting an Excel file does **not** create duplicate records.
- [x] Deleting a row in a specific project budget does **not** delete other project budgets.
- [x] Finance Master numbers (e.g., 23.0L) are correctly stored as **2,300,000**.
- [x] Recruiting productivity targets (Lacs/head) are normalized to INR for gap analysis.
- [x] The "SLA Matrix" shows only valid accounts, not "Metrics to be picked" entries.

**Shield Status: ACTIVE (Global Sync Verified)**
