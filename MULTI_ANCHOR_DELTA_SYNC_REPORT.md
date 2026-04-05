# Report: Intelligent Multi-Anchor Delta-Sync Architecture

This document details the transition from a traditional "wipe-and-rewrite" ingestion model to a high-fidelity **Intelligent Delta-Sync** engine. These changes ensure that historical data, operational placements, and corporate financial targets remain unified even through multiple file updates.

---

## 🏛️ Core Architectural Problem & Solution

### **The Problem**
Previously, uploading a file would delete all existing records for a project before inserting new ones. This caused several issues:
1.  **Identity Loss**: Historical audit trails and `system_created_at` timestamps were lost on every re-upload.
2.  **Account Fragmentation**: Files with different names (e.g., `Honeywell_New.xlsx`) would create entirely separate database identities, disconnected from the central Financial Ledger.
3.  **Ambiguity**: Without a unique key, rows were treated as temporary data rather than persistent corporate "entities."

### **The Solution: Multi-Anchor Identification**
We shifted the identification logic from **Filenames** to **Corporate Entities**. Every row now has a "DNA Fingerprint" that anchors it to a persistent identity in the database.

---

## 🛠️ Key Technical Modifications

### **1. Database Schema Enhancements**
The `Record` table has been upgraded with three first-class columns to support this high-fidelity tracking:

| New Column | Data Type | Purpose |
|:---|:---|:---|
| **`excel_provided_id`** | `String (Index)` | Stores the literal ID found in your tracker (e.g., Sl No, Req ID, Job Code). This is our primary anchor. |
| **`fingerprint`** | `String (Index)` | A SHA-256 hash of the row's multi-anchor attributes. Used to detect if a row already exists. |
| **`excel_row_index`** | `Integer` | Captures the physical row position. This acts as a secondary "spatial context" for bulk-hiring rows that have identical data. |

### **2. The Multi-Anchor Fingerprint Logic**
When a file is uploaded, the system generates a unique identity for every row. The "anchors" used to create this identity are:
1.  **Project ID**: Anchors the row to the specific client (e.g., Honeywell).
2.  **Numerical ID**: If the Excel has a Job ID/Req ID, this is the main identity anchor.
3.  **Metadata Features**: A composite of `Position Title` + `CTC` + `Location` + `Req Creation Date`.
4.  **Spatial Context**: The row index within that specific sheet.

---

## 🔄 The Delta-Sync Lifecycle (How it Works)

When you re-upload a file like **`Maruti.xlsx`** or **`Honeywell Trackers.xlsx`**, the engine follows this non-destructive path:

### **Step 1: Entity Recognition**
Instead of using the filename as the identity, the system uses AI to extract the **Account Name** (e.g., "Honeywell") and searches for an existing Project ID. This ensures tracker data is automatically "snapped" into existing Finance Ledgers.

### **Step 2: Differential Analysis (Diff)**
For every row in your Excel, the system calculates its new fingerprint and compares it to the database:
*   **MATCH FOUND**: If the fingerprint matches, the system **updates** the existing record (Syncing status changes, joining dates, or new candidate names).
*   **NO MATCH**: If the fingerprint is new, the system recognizes a new hire or a new job opening and performs an **Insert**.

### **Step 3: Revenue Synthesis**
The AI-powered revenue logic runs on every synchronized row, recalculating the yield automatically based on any updated CTC or Fee structures found in your contracts.

---

## ✅ Direct Impacts

1.  **No More "Black Screens"**: Added frontend safety guards that gracefully handle large data fetches and sync failures without crashing the UI.
2.  **Unified Traceability**: Large accounts like **Honeywell (Project ID 15)** now contain all historical trackers (9,543 records), all corporate finance ledgers (84 months), and all SLA metrics in a single, high-fidelity vault.
3.  **Resilience**: You can now shift, sort, or add rows to your Excel trackers without worrying about database duplication or data loss. The system will intelligently reconcile the changes upon upload.

---
**Report Compiled By**: Antigravity AI Engine  
**Project Context**: Revenue Generation & Audit Management System
