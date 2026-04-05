# Corporate Finance Integration: Architectural Audit & Integration Report

This document details the strategic and technical implementation of the **Corporate Finance Cluster**, a sophisticated data layer that synchronizes Taggd's official financial records with operational performance metrics.

---

## 1. The "Why": Strategic Objectives
Prior to this integration, the system tracked "Operational Revenue" (calculated bottom-up from individual candidate placements). However, official organizational health is determined by the **Corporate Ledger** (Top-Down). 

The primary objectives of this update were:
*   **Budget vs. Actual (BvA) Visibility**: Track performance attainment against official fiscal year targets.
*   **Liquidity Monitoring**: Identify "Unbilled Revenue" to mitigate cash flow risks.
*   **Operational Efficiency**: Link financial outcomes directly to the human resources (WFM) being deployed.
*   **Audit-Ready Accountability**: Ensure every financial number is traceable back to its source Excel file and timestamp.

---

## 2. Database Evolution: The Finance Schema
We've introduced three core tables that inherit from the **`AuditMixin`**, providing a high-integrity financial foundation.

### **A. `finance_monthly_ledger` (Profitability)**
This table is the primary record for account-level profit and loss.
*   **Fields**: `budget_value`, `forecast_value`, `actual_value`, `actual_cost`.
*   **Normalization**: Instead of storing 12 columns for 12 months, it stores **monthly rows**. This allows for infinite longitudinal analysis and easy time-series comparison.
*   **Metric Differentiation**: Uses a `metric_category` (Revenue vs. Contribution Margin) to store different financial dimensions in a unified structure.

### **B. `finance_cash_flow` (Liquidity & Receivables)**
Dedicated to tracking the movement of money across the organizational portfolio.
*   **Fields**: `unbilled_amount`, `collection_target`, `actual_collected`, `bad_debt`.
*   **Significance**: This separates "Paper Profits" (Revenue) from "Bank Balance" (Collected), allowing for a true risk assessment of account sustainability.

### **C. `finance_efficiency_kpis` (Finance Operations)**
Links financial goals to internal Taggd staffing metrics.
*   **Fields**: `target_revenue_per_recruiter`, `approved_headcount`, `actual_ppc`.
*   **Significance**: Direct mapping between Finance and WFM—revealing if an account's headcount is mathematically profitable.

---

## 3. The Ingestion Engine (`ingest_finance.py`)
The most significant technical challenge was the complexity of the source file (`FY24-25_Finance Data.xlsx`). The ingestion engine uses several advanced patterns:

### **Polymorphic Header Detection**
The Finance files contain mixed-type headers. Some sheets use strings ("Apr", "May"), while others use actual **Python Datetime objects**. 
*   **The Solution**: A multi-path detection logic that identifies both types and normalizes them into a standard `YYYY-MM-DD` reporting date for the database.

### **Wide-to-Long Transformation**
Excel files are "Wide" (Months are columns). Databases work best when "Long" (Months are rows).
*   **The Solution**: The script iterates through every project row and performs an **un-pivot operation**, creating up to 12 distinct database records for every single Excel row. This ensures the dashboard can filter by month with zero performance penalty.

### **Zero-Loss Data Synchronization**
The script processes **15+ sheets sequentially**. It avoids data loss by performing **Upserts (Update + Insert)**:
1.  Check for an existing project from the SLA or WFM integrations.
2.  If the account is new (Finance-only), create a new profile.
3.  Inject the **Audit Signature** (source filename and system timestamp) into every record.

---

## 4. Frontend: The Fiscal Performance Dashboard
We have provided a premium interface that translates this raw database into executive insights.

### **Metrics & Intelligence**
*   **Revenue attainment**: Calculated as `(Total Actual / Total Budget) * 100`.
*   **Collection Efficiency**: Calculated as `(Collected / (Collected + Unbilled)) * 100`, highlighting accounts where cash is stuck.
*   **Monthly Account Ledger**: Searchable, filterable table showing specific month-over-month snapshots with RAG status badging for attainment tiers (90%+ Green, 70-90% Amber, <70% Red).

---

## 5. Summary Tracking
Every financial record now exists within the **Trinity of Connectivity**:
1.  **Operation Record**: SLA performance and candidate counts.
2.  **Resource Record**: WFM recruiter allocations and gaps.
3.  **Fiscal Record**: Official Revenue, Cost, and Margin.

**You can now ask the system: *"Is the low Margin (Finance) on Account X caused by the 20% Resource Gap (WFM) which led to the falling SLA Score (Ops)?"***
