# Data ingestion runbook

This document lists **every production-style data ingestion** path in this repository: what it loads, which database tables it touches, and **exact commands** (or API routes) to run it.  

`cd /Users/arjun/Software/tgddata_C1 && python3 backend/scripts/ingest_excel_master_filled_workbooks.py --finance "excel_files_imp/Copy of 10_finance_core_filled.xlsx"`

```
Finance: {'issues': ['finance_cash_flow / finance_efficiency_kpis: each 24-row block is interpreted as two 12-row slices; slice-to-project mapping is resolved by slice fiscal year (69 FY24-25 slices + 93 FY25-26 slices).'], 'ledger_blocks': 240}
```

**Convention**

- Run **CLI scripts from the repository root** so imports resolve (`python3 backend/scripts/...`).
- Set `DATABASE_URL` if you are not using the default SQLite file (`sqlite:///./revenue_generator.db` relative to the process working directory).
- Paths below use the repo’s `excel_files_imp/` folder; adjust paths for your environment.

---

## 1. Sequence we ran (chronological) — files ↔ Python scripts

This is the **actual order** used when bringing the portfolio templates in line with the DB (directory → SLA → revenue). Re-run in the same order if you refresh those workbooks.


| Step   | When in sequence                                                                             | Python script                                                                                                              | Input file(s)                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | First: authoritative directory on disk                                                       | `backend/scripts/run_account_mapping_sync.py` (internally calls `ingest_project_master.py` → `ingest_project_master_file`) | `excel_files_imp/Account Detail Mapping.xlsx`                                                                                                                               |
| **1b** | Optional preview only                                                                        | Same script with `--dry-run`                                                                                               | Same `.xlsx` (no `ingest_project_master` write)                                                                                                                             |
| **2**  | After directory ingest: attach SBU `account_name` rows to sheet **Group Name** / charge rows | `backend/scripts/reconcile_mapping_clients.py`                                                                             | `excel_files_imp/Account Detail Mapping.xlsx` (default path; or pass path as first arg)                                                                                     |
| **2b** | Before committing reconcile                                                                  | `reconcile_mapping_clients.py --dry-run`                                                                                   | Same                                                                                                                                                                        |
| **3**  | After projects/clients are aligned                                                           | `backend/scripts/ingest_sla.py`                                                                                            | `excel_files_imp/Raw Data SLA Basefile.xlsx` (sheet **Base File**; default path in script `__main__` is repo `excel_files_imp/…`)                                           |
| **4**  | After SLA (uses same project resolver family)                                                | `backend/scripts/ingest_revenue_trackers.py`                                                                               | `excel_files_imp/Revenue_Forecast_Template_1.xlsx` **and** `excel_files_imp/Revenue_Visibility_Tracker.xlsx` (one command; `--forecast` / `--visibility` override defaults) |


**Commands (copy-paste, in order):**

```bash
# 1 — Directory ingest + markdown report (omit --dry-run to write DB + report)
python3 backend/scripts/run_account_mapping_sync.py

# 2 — SBU / client link (preview then apply)
python3 backend/scripts/reconcile_mapping_clients.py --dry-run
python3 backend/scripts/reconcile_mapping_clients.py

# 3 — SLA master
python3 backend/scripts/ingest_sla.py "excel_files_imp/Raw Data SLA Basefile.xlsx"

# 4 — Revenue forecast + visibility (preview then apply)
python3 backend/scripts/ingest_revenue_trackers.py --dry-run
python3 backend/scripts/ingest_revenue_trackers.py
```

**Artifacts produced in that run:** `excel_files_imp/account_mapping_sync_report.md` (from step 1 when not `--dry-run`).

---

## 2. Recommended order (fresh or quarterly refresh)

Same logic as §1, extended for other masters you may run later:

1. **Project directory / charge codes** — `Account Detail Mapping.xlsx` via `run_account_mapping_sync.py` and/or `ingest_project_master.py`, then `**reconcile_mapping_clients.py`** when sheet **Group Name** is the client and DB rows are SBUs.
2. **SLA master basefile** — `Raw Data SLA Basefile.xlsx` → `ingest_sla.py`.
3. **Revenue forecast + visibility** — `Revenue_Forecast_Template_1.xlsx` + `Revenue_Visibility_Tracker.xlsx` → `ingest_revenue_trackers.py`.
4. **Finance master** — ledger, cashflow, KPIs (large; run when finance files update).
5. **WFM master** — headcount / benchmark snapshots (when WFM workbook updates).
6. **Contracts** — when `Project Signup Renewal Detail.xlsx` (or equivalent) is available (`ingest_project_contracts.py` or **Client contracts** → `POST /contracts/upload`).
7. **Budget / forecast workbook** — via API (parsed sheets); used by governance / bridge logic.

Recruiting / project **trackers** (per-file uploads) are normally done through the **Ingestion Center** in the app (`POST /upload`, `POST /upload/pro/confirm`, etc.); those flows are not duplicated as standalone scripts here.

---

## 3. Project directory & client linkage

### 3.1 `ingest_project_master.py` — directory metadata on existing projects

**Purpose:** Reads the first sheet of the Excel **project directory** (e.g. **Account Detail Mapping.xlsx**). Matches rows to existing `projects` by **charge code** and/or **Group Name** / `account_name`, then updates directory fields (`region`, `practice_head`, `charge_code`, `client_id` from Group Name when no parent client column, etc.). **Does not create new projects** from the sheet alone in the normal “directory row” path.

**Input:** `.xlsx` with recognized headers (e.g. `New Charge Code`, `Group Name`, `Region`, …).

**Tables:** `projects`, `clients` (find-or-create client from Group Name / parent client).

```bash
python3 backend/scripts/ingest_project_master.py "excel_files_imp/Account Detail Mapping.xlsx"
```

**API (same logic):** `POST /projects/metadata/upload` — multipart file upload.

---

### 3.2 `reconcile_mapping_clients.py` — SBU rows ↔ directory when names differ

**Purpose:** For rows where the sheet **Group Name** is the client (e.g. `Siemens`) but the database uses **SBU** `account_name` values (e.g. `Siemens - GBS`), this script walks **all** projects, matches each row to the mapping sheet by **charge code** or **longest matching group prefix**, and applies directory metadata **without** clobbering SBU-style `account_name` when appropriate.

**Tables:** `projects`, `clients`.

```bash
python3 backend/scripts/reconcile_mapping_clients.py --dry-run
python3 backend/scripts/reconcile_mapping_clients.py
```

Default file: `excel_files_imp/Account Detail Mapping.xlsx` (override with positional `file` argument).

---

### 3.3 `run_account_mapping_sync.py` — ingest directory + markdown report

**Purpose:** Calls `ingest_project_master_file` on the mapping workbook (unless `--dry-run`), then writes `excel_files_imp/account_mapping_sync_report.md`: projects/clients that look **off** the authoritative roster (including SBU prefix rules consistent with reconcile).

```bash
python3 backend/scripts/run_account_mapping_sync.py
python3 backend/scripts/run_account_mapping_sync.py --dry-run
python3 backend/scripts/run_account_mapping_sync.py path/to/Account\ Detail\ Mapping.xlsx
```

---

## 4. SLA master basefile

### `ingest_sla.py`

**Purpose:** Sheet **Base File** only (exact sheet name) in workbooks such as **`excel_files_imp/Raw Data SLA Basefile.xlsx`**. Upserts **`metric_definitions`** and **`sla_performances`** per project + performance measure + period columns. Resolves **Project** to **`projects`** using `backend.core.sla_project_resolve` (normalized names, SBU patterns, fuzzy match) before creating a new project. Other sheets in the same workbook (Region Summary, Account Summary, etc.) are **ignored** by this script.

**Tables:** `projects` (only if unmatched), `metric_definitions`, `sla_performances`.

**Score columns (important):** Period values are read from every column whose header contains **`Score`**, **except** catalog headers that also match **“Metrics to be picked …”** (e.g. `Metrics to be picked of BE Score (Measure Name as per standard Metrics)`). That column holds metric catalog text, not a month snapshot; including it previously produced bogus `sla_performances` rows. The **column immediately to the right** of each period **`… Score`** header is treated as the paired MET/RAG/status column.

**Metric group:** The BE “metrics to be picked …” column is detected by header substring (`Metrics to be picked` + `BE Score`) and mapped to **`metric_definitions.metric_group`** when present.

**Logging / observability:**

- Python **`logging`** on `backend.scripts.ingest_sla` (INFO; errors include tracebacks).
- Return payload includes **`logs`**: ordered strings (start, column counts, excluded headers, progress every 100 metric rows, commit summary with **`performance_cells_written`**).
- **`POST /sla/upload`** returns that payload on success (plus **`status`**, **`message`**). If ingest completes with **`ok: false`**, the API responds **400** with **`detail`** set to the error message (and ingestion audit logs failure).

**Useful response fields (API / CLI dict):** `rows_processed`, `rows_skipped_header`, `rows_skipped_empty_metric`, `projects_created`, `metrics_cataloged`, `performance_cells_written`, `match_reasons`, `score_columns`, `logs`.

**UI:** Ingestion Center → **SLA** tab appends **`logs`** lines to the run log panel after upload and shows metric row / score-cell counts in the success card.

```bash
python3 backend/scripts/ingest_sla.py
python3 backend/scripts/ingest_sla.py "excel_files_imp/Raw Data SLA Basefile.xlsx"
```

**API:** `POST /sla/upload` — uploads file to a temp path then calls `ingest_sla(file_path, db=db)` and returns the ingest summary (see above).
---

## 5. Revenue weekly forecast & visibility

### `ingest_revenue_trackers.py`

**Purpose:** Two templates:


| File                               | Sheet                   | Target tables                 |
| ---------------------------------- | ----------------------- | ----------------------------- |
| `Revenue_Forecast_Template_*.xlsx` | `Revenue Forecast Data` | `revenue_forecast_weekly`     |
| `Revenue_Visibility_Tracker.xlsx`  | `Revenue Tracker`       | `revenue_visibility_snapshot` |


Amounts in these templates are treated as **INR** (full rupee values), consistent with `*_inr` columns. Project names use the same resolver as SLA plus a small manual alias map (e.g. combined Siemens row → `Siemens - Advanta` — edit the script if policy changes).

```bash
python3 backend/scripts/ingest_revenue_trackers.py --dry-run
python3 backend/scripts/ingest_revenue_trackers.py
python3 backend/scripts/ingest_revenue_trackers.py --forecast "excel_files_imp/Revenue_Forecast_Template_1.xlsx" --visibility "excel_files_imp/Revenue_Visibility_Tracker.xlsx"
```

**Note:** Does not require `revenue_weekly_submission` rows; `weekly_submission_id` may stay null unless you use the platform workflow to attach packs.

---

## 6. Corporate finance master

### `ingest_finance.py` — `ingest_finance_master`

**Purpose:** Ingests the **corporate finance** workbook (Ingestion Center → **Finance ledger**): multiple sheets for monthly ledger, cash flow, and efficiency KPIs. Rows match **`projects`** using the **`Project`** column (case-insensitive `account_name`; creates a project when missing). Ends with **`dedupe_finance_tables`**.

**Tables:** `finance_monthly_ledger`, `finance_cash_flow`, `finance_efficiency_kpis`, and touches **`projects`** / **`clients`** (`ensure_project_client`).

**Example workbooks:** `excel_files_imp/FY24-25_Finance Data.xlsx`, `dashboard_exp/finance/source/FY25-26_Finance_Data.xlsx` (same structural family: `Revenue_Budget`, datetime month columns, etc.).

### 6.1 Month columns and `reporting_month`

- Typical masters use **Excel date columns** for Apr–Mar (e.g. `2025-04-01` … `2026-03-01`). Those headers are read as `datetime` values and stored **as-is** on `reporting_month` (first of month).
- If month headers are **strings** (e.g. `Apr-25`), the script maps them with **`get_month_date(month, fy_from_row)`**. The **`FY`** cell should be present (e.g. `FY2025-26`). If **`FY` is missing**, the code falls back to **`FY2024-25`**, which would **mis-date** a FY25-26 file for those sheets only.

### 6.2 Lacs → INR (heuristic)

- Monetary cells: if **`0 < abs(val) < 2000`**, the value is multiplied by **`100_000`** (treated as **Lacs** → absolute INR).
- **Caveats:** Values **≥ 2000** that are still in Lacs are **not** scaled. Very small values already in INR (**&lt; 2000**) could be **over-scaled**. Headcount-style KPI fields (`approved_headcount`, `actual_headcount_finance`, `actual_headcount_wl1`, `taggd_joiners`, `non_taggd_joiners`) **skip** this multiplier for their sheets; **`rev_productivity_actual_inr`** follows the **lac rule** like **`target_revenue_per_recruiter`**.

### 6.3 Sheets the script ingests (by alias)

Matching is **exact sheet name first**, then **normalized** match (underscores ↔ spaces, case-insensitive). Representative aliases:

| Target | Sheet aliases (examples) | DB |
| ------ | ------------------------ | --- |
| Ledger — Revenue | `Revenue_Budget`, `Revenue_Actual`, `Rev_Forecast`, … | `finance_monthly_ledger` (`metric_category` Revenue; `budget_value` / `actual_value` / `forecast_value`) |
| Ledger — Contribution Margin | `CM_Budget`, `CM_Actual`, `CM Actual`, `CM_Forecast`, … | same table (`metric_category` Contribution Margin) |
| Ledger — Cost | `Actual Cost`, `Actual_Cost`, `Cost_Actual`, `Actual Cost Sheet` | same table (`metric_category` Cost, field `actual_cost`) |
| Cash flow | `Unbilled`; `Target_Collection` / `Collection Target`; `Actual_Collection` / `Revenue_Collected` / …; `Bad Debt` | `finance_cash_flow` |
| KPIs | `Target Rev Productivity`; `Headcount_Approved`; `Headcount_Overall`; `Headcount_WL1`; `Taggd_Source_Joiner`; `Non Taggd_Source_Joiner`; `Rev_Productivity_Actual` | `finance_efficiency_kpis` (+ updates **`projects.has_taggd_joiner_sheet`** from accounts on **`Taggd_Source_Joiner`**) |

### 6.4 Tabs often present but **not** loaded by this script

Workbooks such as **`FY25-26_Finance_Data.xlsx`** may include tabs that are **ignored** until aliases/specs are extended:

- **`PPC_Actual`** — layout is valid after **`header=1`** retry (`_load_finance_sheet`), but the sheet name is **not** in the Cost alias list, so **`actual_cost`** is **not** populated from this tab.
- **`Revenue_Adjustment`** — not mapped; **`finance_cash_flow.adjustments`** is **not** filled from this sheet.
- **`Mapping`** — reference-only.

**`FinanceEfficiencyKPI.target_ppc_inr`** is **not** set by `ingest_finance.py` (PPC may be derived in APIs from cost ÷ headcount where data exists).

### 6.5 Operational notes

- Per-sheet errors are caught and logged; other sheets may still commit. For a **fatal** error the script rolls back and prints a traceback but **does not re-raise**, so **`POST /finance/upload`** can still return **200** in edge cases — verify logs / DB row counts after uploads if numbers look wrong.

The bundled `__main__` default path is machine-specific; **always pass the file explicitly**:

```bash
python3 -c "from backend.scripts.ingest_finance import ingest_finance_master; ingest_finance_master('excel_files_imp/FY24-25_Finance Data.xlsx')"
```

```bash
python3 -c "from backend.scripts.ingest_finance import ingest_finance_master; ingest_finance_master('dashboard_exp/finance/source/FY25-26_Finance_Data.xlsx')"
```

Or:

```bash
python3 <<'PY'
import sys
sys.path.insert(0, ".")
from backend.scripts.ingest_finance import ingest_finance_master
ingest_finance_master("excel_files_imp/FY24-25_Finance Data.xlsx")
PY
```

**API:** `POST /finance/upload` (file saved to temp dir; **`ingest_finance_master`** runs on a **worker thread**).

### 6.6 Reconciling KPIs to Executive Overview and CEO’s View

**`GET /finance/data`** returns merged per–client-month KPIs from `finance_efficiency_kpis` (**WL1**, Tag / non-Tag joiners, **`rev_productivity_actual_inr`**, targets, etc.). On **Executive Overview** (`Dashboard.tsx`), **Avg Taggd source prod.** uses **Σ `taggd_joiners` ÷ Σ WL1** on **`kpiRows`** (FY-scoped), matching **“Financial performance”** for the same FY — see **`docs/DATA_AND_INFORMATION_FLOW.md`** §6 and **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §8.

**CEO’s View** (`/ceo-view`) adds the **Taggd-sheet cohort** (`projects.has_taggd_joiner_sheet`) for **Operational Pulse** metrics and depends on **`Non Taggd_Source_Joiner`** + **`Rev_Productivity_Actual`** ingest — see **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §9 and **`FINANCE_METRICS_AND_UPDATES_REFERENCE.md`** §7. **Re-ingest** the corporate master after upgrading so cohort flags and new columns are populated.

---

## 7. WFM / headcount projection master

### `ingest_wfm.py` — `ingest_wfm_master`

**Purpose:** Ingest **`excel_files_imp/WFM (Projected Headcount & Revenue).xlsx`** (and workbooks with the same layout).

**Sheet selection**

- Prefer **`Projected HC - FY26`** (exact name).
- Else the first sheet whose name contains **`Projected HC`** (case-insensitive) and **does not** contain **`(Q4)`** — the **Q4-only** tab uses different semantics at the same column indices and must not be used by this importer.

**Main grid** (sheet names like **Projected HC - FY26**, **Projected HC - FY27**, …)

- **`reporting_date`**: parsed from **`FYxx`** in the top rows (Indian FY: **FY26 → 2025-04-01**); fallback **2025-04-01** if not found.
- **Projects:** **`resolve_project_for_sla`** on **“Project as per EDB”** (fallback **Project**); creates a project only when unmatched. Stamps **`charge_code`** from **Project Code** when missing; **`vertical`** ← Industry; **`practice_head`** ← PH; **`function_head`** ← FH; **`region`** ← Region.
- **`wfm_hr_benchmarks`:** Upsert per **`project_id + reporting_date`**. Core columns: lateral revenue / HC / productivity **YTD**, ideal HC, WL1–WL4 actuals, overall HC (same indices as before). Extended quarter-level metrics, ideal HC by WL, **open-position counts**, bench variance, and **RPH/CPH** are stored in **`sheet_metrics_json`** (JSON).
- **`wfm_resource_gaps`:** Rows from the **Open Positin List** sheet (name contains **open** + **posit**). Prior rows with **`uploaded_by = ingest_wfm_master`** are replaced each run; then current open reqs are upserted by **`project_id + req_id`** (client resolved via **`resolve_project_for_sla`** on **Client**).

**Logging / API:** Returns **`logs`**, **`benchmarks_saved`**, **`gap_rows_written`**, **`sheet_used`**, **`reporting_date`**. **`POST /wfm/upload`** returns these fields and responds **400** if **`ok`** is false.

**Tables:** `wfm_hr_benchmarks`, `wfm_resource_gaps`, `projects`, `clients` (via ensure).

```bash
python3 -c "from backend.scripts.ingest_wfm import ingest_wfm_master; ingest_wfm_master('excel_files_imp/WFM (Projected Headcount & Revenue).xlsx')"
```

**API:** `POST /wfm/upload` (uses request DB session; no background thread).

---

## 8. Project contracts (signup / renewal)

### `ingest_project_contracts.py`

**Purpose:** Sheet **Contract Data** in **Project Signup Renewal Detail.xlsx**-style workbooks. Resolves **Customer** with `**resolve_project_for_sla`** (same as SLA: group→SBU, client singleton, fuzzy) so **Client / SBU hierarchy stays aligned** with the project directory, not a single-column exact name match. **Upserts** one contract row per project per run (update row with same `source_filename` for that `project_id`, or latest row) so re-ingests do not pile duplicate rows. Writes `excel_files_imp/contract_workbook_ingest_report.md` next to the workbook (use `--no-report` to skip).

```bash
python3 backend/scripts/ingest_project_contracts.py "path/to/Project Signup Renewal Detail.xlsx"
```

**API (same parser):** `POST /contracts/upload` — multipart field `file`; calls `ingest_contract_workbook_file` in `backend/routers/project_contracts.py`. Used from **Client contracts** in the app (`Project Signup Renewal Detail.xlsx` or the same **Contract Data** layout).

**Tables:** `project_contracts`, `projects` / `clients` via `ensure_project_client` where applicable.

---

## 9. Budget & MMF forecast workbook (ledger)

**Purpose:** Parsed **budget** + **forecast** sheets are ingested into the **budget/forecast ledger** used by revenue governance (see `backend/core/budget_forecast_ledger.py` — `ingest_budget_forecast_workbook`).

**Typical entry:** `POST /api/upload/budget-forecast` with the workbook file. The handler resolves project names to IDs and runs `ingest_budget_forecast_workbook` inside the app.

There is **no standalone CLI** in `backend/scripts/` for this path; use the API or call `ingest_budget_forecast_workbook` from a notebook with the same `df_budget` / `df_forecast` / `name_to_id` contract as `main.py`.

---

## 10. Recruiting / tracker uploads (application UI)

These are **not** single-template scripts; they drive project creation, column mapping, and record ingestion:

- `POST /upload` — standard upload pipeline.
- `POST /upload/pro/inspect` / `POST /upload/pro/confirm` — guided Pro flow.
- `POST /projects/{project_id}/logic/regenerate-from-upload` — re-run mapping/logic from a saved workbook.

**Contract workbook (template, not generic tracker ingest):** `POST /contracts/upload` — **Project Signup Renewal Detail.xlsx** (sheet **Contract Data**); see §8. In the UI this is the **Client contracts** workbook upload, not the Ingestion Center Express path.

See `backend/main.py` and the **Ingestion Center** frontend for behaviour and auth on tracker uploads; see `backend/routers/project_contracts.py` for contracts.

---

## 11. Optional: seeds & maintenance (not “source of truth” ingest)


| Script                                          | Use                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `backend/scripts/seed_revenue_trackers.py`      | Demo rows for `revenue_forecast_weekly` / `revenue_visibility_snapshot`. |
| `backend/scripts/seed_billing_dummy.py`         | Dummy billing data.                                                      |
| `backend/scripts/merge_duplicate_projects.py`   | Cleanup after bad duplicates — run with care.                            |
| `backend/scripts/backfill_candidate_masters.py` | Data repair / backfill — read script header before running.              |


---

## 12. Quick reference table


| What                          | Command / route                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Directory / mapping           | `python3 backend/scripts/ingest_project_master.py "<xlsx>"`                                                                     |
| SBU ↔ mapping reconcile       | `python3 backend/scripts/reconcile_mapping_clients.py`                                                                          |
| Mapping sync + report         | `python3 backend/scripts/run_account_mapping_sync.py`                                                                           |
| SLA master                    | `python3 backend/scripts/ingest_sla.py` or `POST /sla/upload`                                                                   |
| Revenue forecast + visibility | `python3 backend/scripts/ingest_revenue_trackers.py` **or** `POST /revenue-trackers/ingest-upload` (Ingestion Center → Express) |
| Finance master                | `ingest_finance_master("…")` or `POST /finance/upload`                                                                          |
| WFM master                    | `ingest_wfm_master("…")` or `POST /wfm/upload`                                                                                  |
| Contracts                     | `python3 backend/scripts/ingest_project_contracts.py "<xlsx>"` **or** `POST /contracts/upload` (Client contracts UI)            |
| Budget/forecast ledger        | `POST /api/upload/budget-forecast`                                                                                              |
| Tracker uploads               | `POST /upload` (and related Pro endpoints)                                                                                      |


---

## 13. After any ingest

- Spot-check `/ingestion/events` or activity feeds if enabled.
- For mapping/SLA/revenue, re-open `excel_files_imp/account_mapping_sync_report.md` after `run_account_mapping_sync.py` if you need roster vs DB drift.
- For finance, the script runs `dedupe_finance_tables` at the end of a successful ingest.

If you add a new script, append a section here with **inputs**, **tables**, and **one copy-paste command**.