# Technical Summary: Global Monitoring System Implementation

This document outlines the architectural and functional updates implemented to create a unified, cross-project "Command Center" for recruitment performance and revenue tracking.

---

## 🏗 Core Pillar 1: The Signal Decoding Engine
To prevent manual data cleanup, we introduced an **Interpretive Layer** that decodes the output of the AI-generated revenue logic into a standardized **Global Status**.

### 🧬 Decision Matrix
The system analyzes the *composition* of the `revenue_results` JSON object for every record and assigns a `global_status`:

| Financial Signal | AI Status Message | Global Status | Technical Meaning |
| :--- | :--- | :--- | :--- |
| `closing_fee > 0` | (Any) | **CLOSED** | Position is filled; Revenue fully realized. |
| `opening_fee > 0` | (Any) | **ACTIVE** | Job is live; Opening fee recognized. |
| `revenue == 0` | "Offer/Interview/Sourcing" | **PIPELINE** | Active recruiting journey. |
| `revenue == 0` | "Hold/Cancel/Void" | **ON HOLD** | Temporarily or permanently inactive. |
| (Default) | (Any) | **UNPROCESSED** | No significant signals detected. |

---

## 🔍 Core Pillar 2: Position Deduplication Engine
Since Excel trackers are candidate-heavy (one job has many rows), the system now calculates **true inventory** rather than row counts.

### 📍 Anchor Identification
During the upload process, the system automatically runs a keyword scan on headers to find the **Position Identifier** (e.g., `Req ID`, `Job Code`). This identifier is saved as `pos_id_column` in the project metadata.

### ⚖️ State Priority Stack
When calculating global stats, the engine groups all candidates for a single `pos_id`. It then applies a **Priority Escalation** to decide the position's state:
1.  **Level 1 (CLOSED):** If ANY candidate for that ID has a closing fee.
2.  **Level 2 (ACTIVE):** If no one has joined, but an opening fee exists for that ID.
3.  **Level 3 (PIPELINE):** If all candidates are currently in recruitment steps.

This ensures that the dashboard correctly shows **1 Position** even if 100 people are being interviewed for it.

---

## 🗄 Core Pillar 3: Database Schema Enrichment
Two critical columns were added to the SQLite backend to support high-performance global querying:

1.  **`projects.pos_id_column`**: Stores the header name used for deduplicating that specific client's data.
2.  **`records.global_status`**: Stores the normalized state (`CLOSED`, `ACTIVE`, etc.) for instant indexing and aggregation.

---

## 🖥 Core Pillar 4: The Command Center (Frontend)
The **Dashboard** was completely redesigned into a High-Impact "Command Center" UI.

### 📊 Key Dashboard Features:
*   **Consolidated Revenue Widget**: Real-time sum of all revenue buckets across every vault.
*   **Inventory Status Matrix**: A visual progress bar showing the distribution of your global pipeline (Closed vs. Active vs. Pipeline).
*   **Vault Performance Index**: A project-level breakdown showing which clients are driving the most volume and revenue.
*   **Signal Integrity Tag**: A "Consistency Guarantee" banner indicating that all data is normalized 1:1 using the interpretive logic layer.

---

## 📁 Updated Files
*   `backend/db/database.py`: Schema expansion for global metadata.
*   `backend/core/processor.py`: Implementation of the `_derive_global_status` signal decoder.
*   `backend/main.py`: New `/stats/global/monitor` API and Deduplication detection logic.
*   `frontend/src/pages/Dashboard.tsx`: Redesigned Command Center UI.
*   `frontend/src/components/GlowCard.tsx`: Enhanced to support footer metadata and sub-text.
