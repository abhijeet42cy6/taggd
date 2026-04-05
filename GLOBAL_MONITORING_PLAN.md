# Implementation Plan: Centralized Global Monitoring System

## 1. Executive Summary
The goal is to build a unified monitoring layer that extracts a "Global Truth" from disparate Excel sheets. Every client uses different terminology (e.g., "Joined", "Filled", "YTJ"), and every contract has different revenue triggers (e.g., "Opening Fees", "Closing Fees"). 

This system will **normalize** these variations into a central dashboard showing **Total Positions**, **Real-time Status**, and **Aggregated Revenue** without modifying the existing `LogicGeneratorAgent`.

---

## 2. Technical Architecture: "Computationally Derived State"
Instead of "guessing" the status of a position, the system will **mirror the behavior of the AI-generated revenue logic**. If the logic realizes a "Closing Fee," the system adopts that as a signal that the position is closed.

### 2.1 The Data Stream
1.  **Ingestion:** Raw Excel Row $\rightarrow$ Column Mapping.
2.  **Execution (No Change):** The `LogicGeneratorAgent` produces its `calculate(row)` function.
3.  **The "Signal Decoder":** A post-processing step analyzes the *composition* of the returned `revenue_results`.
4.  **Tagging:** A "Shadow Tag" is saved to the `records` table in a new `global_meta` JSON column.

---

## 3. The Signal Decoding Matrix (The "Translator")
This matrix converts the **AI Output** into **Global Monitoring States**.

| AI Calculation Bucket | AI Status Message Content | Derived Global State | Position Lifecycle Phase |
| :--- | :--- | :--- | :--- |
| `closing_fee > 0` | (Any) | **CLOSED / FILLED** | Revenue fully realized; slot is taken. |
| `opening_fee > 0` AND `closing_fee == 0` | (Any) | **ACTIVE / OPEN** | Position is live and revenue (Opening Fee) is being recognized. |
| `revenue == 0` | contains "Offered" / "Interview" | **PIPELINE / IN-PROGRESS** | Active recruitment, no revenue realized yet. |
| `revenue == 0` | contains "Hold" / "Cancel" | **ON HOLD / VOID** | Position is temporarily or permanently inactive. |
| `revenue == 0` | (Default) | **UNPROCESSED / OTHER** | Row detected but no financial or status signals found. |

---

## 4. Position-Level Deduplication
A single "Position" often appears as multiple rows (multiple candidates for one job). 

### 4.1 Schema Mapping
The system will use the existing `column_mapping` to identify the **Anchor Column** (the unique identifier for a job, e.g., "Req ID", "Job Code", or "Position Title").

### 4.2 State Priority Rules
To show the correct "Global Position Count," the system applies a **Priority Stack**:
1.  If **ANY** candidate row for a `pos_id` has a `closing_fee > 0` $\rightarrow$ **Position is CLOSED.**
2.  Else if **ANY** candidate row for a `pos_id` has an `opening_fee > 0` $\rightarrow$ **Position is ACTIVE.**
3.  Else $\rightarrow$ **Position is PIPELINE.**

---

## 5. Global Dashboard Core KPIs
The Central Monitoring UI will display the following standardized metrics across all projects:

### 📊 Global Performance
*   **Total Market Requisitions:** `COUNT(DISTINCT pos_id)` across all vaults.
*   **Closure Rate:** `Closed Positions / Total Positions`.
*   **Total Revenue Snapshot:** `SUM(revenue)` with breakdown of `Opening` vs `Closing` fees.

### 🏗 Inventory Monitoring
*   **Open Positions:** Breakdown by Project/Client.
*   **Pipeline Health:** Number of candidates in "Interview/Offered" status (derived from `revenue == 0` status strings).
*   **Revenue Drift:** Revenue recognized from Opening Fees for which a Closing Fee hasn't yet been processed.

---

## 6. Implementation Steps (Phased)

### Phase 1: Database Migration
*   Add `global_status` (String) to the `records` table.
*   Add `pos_id_column` (String) to the `projects` table (to know which header to use for deduplication).

### Phase 2: Post-Process Integration
*   Update the `process_records` background task in `main.py` to run the **Signal Decoder** immediately after the `calculate()` function returns.
*   Save the derived `global_status` to the record.

### Phase 3: The Unified API
*   Create a new `/stats/global/detailed` endpoint that performs the Priority Stack aggregation discussed in Section 4.

### Phase 4: UI Development (Glow-Up Dashboard)
*   A "Command Center" page with high-level charts (Requisitions vs. Closures) and a "Project Performance" leaderboard.

---

## 7. Why This Works
1.  **Zero Loss of Accuracy:** Since the Global Status is **derived from the actual revenue logic**, the dashboard can never report a Closure that doesn't have a corresponding fee.
2.  **No Manual Standardizing:** You don't have to clean your Excel files. The AI-generated code acts as the "Clearing House" that translates messy client data into clean system signals.
3.  **Future Proof:** If a new contract introduces "Milestone Fees," the Decoding Matrix can be extended without touching existing project logic.
