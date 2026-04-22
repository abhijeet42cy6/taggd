# Data ingestion runbook

This document lists **every production-style data ingestion** path in this repository: what it loads, which database tables it touches, and **exact commands** (or API routes) to run it.

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

**Purpose:** Sheet **Base File** in **Raw Data SLA Basefile.xlsx**. Upserts `metric_definitions` and `sla_performances` per project + performance measure + month columns. Resolves **Project** column to `projects` using `backend.core.sla_project_resolve` (normalized names, SBU patterns, fuzzy match) before creating a new project.

**Tables:** `projects` (only if unmatched), `metric_definitions`, `sla_performances`.

```bash
python3 backend/scripts/ingest_sla.py
python3 backend/scripts/ingest_sla.py "excel_files_imp/Raw Data SLA Basefile.xlsx"
```

**API:** `POST /sla/upload` — uploads file to temp path then calls `ingest_sla(file_path, db=db)`.

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

**Purpose:** Ingests the **corporate finance** workbook: multiple sheets (ledger, cashflow, efficiency KPIs, etc.), matched to `projects` by account / project name keys. Includes dedupe pass.

**Tables:** `finance_monthly_ledger`, `finance_cashflow`, `finance_efficiency_kpi`, `projects` (metadata updates where applicable).

The bundled `__main__` default path is machine-specific; **always pass the file explicitly**:

```bash
python3 -c "from backend.scripts.ingest_finance import ingest_finance_master; ingest_finance_master('excel_files_imp/FY24-25_Finance Data.xlsx')"
```

Or add a small wrapper; today the module’s bottom block points at a fixed path — prefer the one-liner above or:

```bash
python3 <<'PY'
import sys
sys.path.insert(0, ".")
from backend.scripts.ingest_finance import ingest_finance_master
ingest_finance_master("excel_files_imp/FY24-25_Finance Data.xlsx")
PY
```

**API:** `POST /finance/upload`.

---

## 7. WFM / headcount projection master

### `ingest_wfm.py` — `ingest_wfm_master`

**Purpose:** Sheet **Projected HC - FY26** (positional column layout). Updates/creates `wfm_hr_benchmarks` rows linked to `projects` (customer / account matching in script).

**Tables:** `wfm_hr_benchmarks`, `projects`.

The bundled default path in `__main__` is machine-specific; **pass the path explicitly**:

```bash
python3 -c "from backend.scripts.ingest_wfm import ingest_wfm_master; ingest_wfm_master('excel_files_imp/WFM (Projected Headcount & Revenue).xlsx')"
```

**API:** `POST /wfm/upload`.

---

## 8. Project contracts (signup / renewal)

### `ingest_project_contracts.py`

**Purpose:** Sheet **Contract Data** in **Project Signup Renewal Detail.xlsx**-style workbooks. Resolves **Customer** with **`resolve_project_for_sla`** (same as SLA: group→SBU, client singleton, fuzzy) so **Client / SBU hierarchy stays aligned** with the project directory, not a single-column exact name match. **Upserts** one contract row per project per run (update row with same `source_filename` for that `project_id`, or latest row) so re-ingests do not pile duplicate rows. Writes `excel_files_imp/contract_workbook_ingest_report.md` next to the workbook (use `--no-report` to skip).

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


| What                          | Command / route                                                |
| ----------------------------- | -------------------------------------------------------------- |
| Directory / mapping           | `python3 backend/scripts/ingest_project_master.py "<xlsx>"`    |
| SBU ↔ mapping reconcile       | `python3 backend/scripts/reconcile_mapping_clients.py`         |
| Mapping sync + report         | `python3 backend/scripts/run_account_mapping_sync.py`          |
| SLA master                    | `python3 backend/scripts/ingest_sla.py` or `POST /sla/upload`  |
| Revenue forecast + visibility | `python3 backend/scripts/ingest_revenue_trackers.py` **or** `POST /revenue-trackers/ingest-upload` (Ingestion Center → Express) |
| Finance master                | `ingest_finance_master("…")` or `POST /finance/upload`         |
| WFM master                    | `ingest_wfm_master("…")` or `POST /wfm/upload`                 |
| Contracts                     | `python3 backend/scripts/ingest_project_contracts.py "<xlsx>"` **or** `POST /contracts/upload` (Client contracts UI) |
| Budget/forecast ledger        | `POST /api/upload/budget-forecast`                             |
| Tracker uploads               | `POST /upload` (and related Pro endpoints)                     |


---

## 13. After any ingest

- Spot-check `/ingestion/events` or activity feeds if enabled.
- For mapping/SLA/revenue, re-open `excel_files_imp/account_mapping_sync_report.md` after `run_account_mapping_sync.py` if you need roster vs DB drift.
- For finance, the script runs `dedupe_finance_tables` at the end of a successful ingest.

If you add a new script, append a section here with **inputs**, **tables**, and **one copy-paste command**.