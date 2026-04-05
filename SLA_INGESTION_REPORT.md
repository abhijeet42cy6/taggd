# SLA & Metric Ingestion Report

This document records the results of the **SLA Master Ingestion Pipeline** (executed on 2026-03-20), which processed the Portfolio-wide SLA Basefile into the newly upgraded database architecture.

## 1. Executive Summary
The ingestion script (`backend/scripts/ingest_sla.py`) was developed to perform a multi-tenant ingest of the **Raw Data SLA Basefile.xlsx**. It successfully synchronized all client metadata and historical performance snapshots.

### **Ingestion Stats**
- **Accounts synchronized**: 54
- **Unique metrics cataloged**: 487
- **Performance snapshots ingested**: 8,191
- **File Source**: `excel_files_SLA/Raw Data SLA Basefile.xlsx`

---

## 2. Ingestion Logic & Mapping
The pipeline maps the complex horizontal structure of the Master SLA Excel into a vertical, time-series database format.

### **Row-Level Mapping (Metadata)**
Each row in the "Base File" sheet is processed as follows:

| Excel Header | System Target | Purpose |
| :--- | :--- | :--- |
| `Project` | `projects.account_name` | Primary client identifier for multi-tenancy. |
| `Region`, `Practice Head`, `BE SPOC` | `projects` (Enterprise Meta) | Enables organizational drill-down. |
| `Performance Measure` | `metric_definitions.label` | Logical name for the Metric (e.g., Time to Fill). |
| `Metric Definition` | `metric_definitions.definition` | Audit trail for what is being measured. |
| `Calculation Method` | `metric_definitions.logic` | Human logic for AI verification. |

### **Column-Level Mapping (Snapshots)**
The script dynamically scans columns for **Month-Year** patterns to extract the time-series performance data.

- **Score Ingestion**: Extracts raw values from columns like `Apr24 Score`, `May24 Score`.
- **RAG Normalization**: Automatically pairs the Score with its corresponding `MET/NOT_MET` status column.
- **Null Handling**: Skips `NaN` or "Not Approved" entries to maintain data cleanliness.

---

## 3. Data Integrity & Relationships
- **Account Linking**: The script uses a "Fuzzy-First" approach to check if an account exists in the `projects` table before creating a new one, ensuring existing candidate-level trackers are linked to their corresponding SLA high-level metrics.
- **Metric Versioning**: By storing the `公式` (formula) and `Target` on the `metric_definitions` table, we ensure that past performance scores remain audit-traceable even if targets change in future Excel revisions.

---

## 4. Usage & Maintenance
The pipeline is designed as a standalone utility to avoid side effects on the main application's real-time candidate processing.

- **Script Path**: `/Users/arjun/Software/tgddata/backend/scripts/ingest_sla.py`
- **Execution**: `python3 backend/scripts/ingest_sla.py [optional_path_to_excel]`

## 5. Next Steps
The backend is now fully populated. The next logical phase is to:
1.  **API Integration**: Expose `GET /api/sla/stats` to feed the frontend.
2.  **Audit Hub Frontend**: Display the **54 Accounts** and their **Metric RAG Statuses** on a unified Command Center dashboard.
