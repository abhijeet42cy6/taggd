# WFM Ingestion Pipeline: Internal Staffing & Performance Metrics

This document details the operation of the **Workforce Management (WFM) Ingestion Engine**, which synchronizes Taggd's internal recruiter productivity and capacity data into the unified database.

## 1. Executive Summary
The ingestion pipeline (`backend/scripts/ingest_wfm.py`) was developed to process the **Projected HC - FY26** sheet from the master WFM Excel file. It bridges the gap between client satisfaction (SLAs) and internal operations (Staffing).

### **Ingestion Stats**
- **Accounts synchronized**: 50
- **Operational snapshots saved**: 50
- **Primary Data Source**: `/Users/arjun/Software/tgddata/excel_files_imp/WFM (Projected Headcount & Revenue).xlsx`
- **Primary Sheet**: `Projected HC - FY26`

---

## 2. Ingestion Logic & Positional Mapping
Because the source Excel file uses complex merged headers (headers span multiple rows), the pipeline uses **Fixed Positional Indexing** instead of column names to ensure maximum accuracy.

### **The Meta-Data Map (Cols 0-9)**
Used to enrich our `projects` table with enterprise context.

| Col Index | Field | Purpose |
| :--- | :--- | :--- |
| `0` | `Customer ID` | Unique account code (CNOxxxx). |
| `1` / `2` | `Account Name` | The primary key for matching WFM data to SLA performance data. |
| `3` | `Vertical` | Categorization (Pharma, Auto, etc.) for industry benchmarking. |
| `7` | `Practice Head` | The Taggd leader responsible for the recruiter's performance. |
| `8` | `Region` | Geographic classification. |

### **The Performance & Capacity Map (Cols 10-40)**
Used to populate the `wfm_hr_benchmarks` table with time-series metrics.

- **Lateral HC Targets (Cols 15-20)**: Aggregates the quarterly "Planned Recruiter Headcount" for the account.
- **Ideal HC (Col 32)**: The theoretical staffing level required by the contract.
- **Current Execution (Cols 34-38)**:
    - `34-37`: The specific count of **Hires** achieved at each **Work Level (WL1, WL2, WL3, WL4)**.
    - `38`: The total **Headcount (HC)** of recruiters actually clocked in on that account.

---

## 3. How the Pipeline Works (Technical Logic)

### **Phase 1: Multi-Sheet Normalization**
The script skips the decorative header rows (Rows 0-2) and initiates a loop through the data rows. It uses **"CNO-ID Validation"** to ensure it only processes rows containing actual client data, ignoring summary totals or empty space at the bottom.

### **Phase 2: Project Synchronization**
For every row, the pipeline attempts to find a matching project in the `projects` table by `account_name`.
- **Match Found**: Updates existing metadata (`vertical`, `practice`).
- **Match Not Found**: Creates a new project profile to ensure Taggd's internal operational history is preserved even for new or unlinked accounts.

### **Phase 3: Snapshot Generation**
A `wfm_hr_benchmarks` entry is created for each account. If a snapshot already exists for the reporting period (FY26), the script **Upserts** the data to reflect the most recent projections, preventing duplicate rows while maintaining a clean historical record.

---

## 4. Operational Value: The "Staffing Gap"
The most powerful outcome of this ingestion is the automated calculation of the **Resource Gap**:
> `Resource Gap = Ideal HC (Col 32) - Actual HRMS HC (Col 38)`

This allows the **Audit Hub** to instantly report if a client's SLA failures are being caused by Taggd's failure to maintain a full recruiter headcount.

## 5. Maintenance & Execution
To refresh the WFM records after an Excel update:
1.  Ensure the file is in `excel_files_imp/`.
2.  Run the command: `python3 backend/scripts/ingest_wfm.py`
3.  Check the console output for the sync summary.
