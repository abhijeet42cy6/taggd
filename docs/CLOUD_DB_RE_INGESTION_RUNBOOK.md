# Cloud deployment: full database re-ingestion runbook

Use this document when the **application is deployed in the cloud** (or any fresh environment) but the **database is empty, outdated, or out of sync** with the Excel source-of-truth files. It gives **order, file locations, and commands** so an operator or an **automation agent** can restore data end-to-end without guessing dependencies.

> **See also**  
>
> - Deeper per-script detail: `docs/DATA_INGESTION_RUNBOOK.md`  
> - Filled `excel_upload_masters` workbooks: `docs/MANUAL_UPLOAD_OBSERVATIONS.md` and `excel_upload_masters/README.md`  
> - Vendor / job board license tracker: `docs/VENDOR_LICENSE_TRACKER.md`

---

## 1. Conventions (must follow every time)


| Item                  | Rule                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Working directory** | Repository **root** (the folder that contains `backend/`, `frontend/`, `excel_files_imp/`, `actual_data/`).                                                                                                                                                                                         |
| **Command style**     | Prefer `python3 backend/scripts/…` or `python3 -m backend.scripts.…` from the repo root so imports resolve.                                                                                                                                                                                         |
| **Database URL**      | If not using the default SQLite file, set `DATABASE_URL` in the environment **before** any script (e.g. Postgres in cloud).                                                                                                                                                                         |
| **SQLite default**    | Often `sqlite:///./revenue_generator.db` (path is relative to the **process current working directory**—run scripts from a known cwd or use an absolute `DATABASE_URL`).                                                                                                                            |
| **Idempotency**       | Most ingests **upsert**; re-running the same file is usually safe but can overwrite in-place. Do not mix **two different pipelines** for the same domain (e.g. legacy SLA basefile *and* filled `08_sla` workbook) without a clear plan—pick **one** SLA path and one finance path per environment. The same applies to **WFM**: pick **either** the filled **09** path (`ingest_excel_master_filled_workbooks.py --wfm`) **or** the legacy **`ingest_wfm.py` / `/wfm/upload`** layout—not both for the same environment without a cleanup strategy. |
| **Secrets**           | Never commit real cloud DB URLs or credentials; inject via env/secret manager.                                                                                                                                                                                                                      |


---

## 2. What “correct” order means

- **Projects and clients** must exist (or be created) **before** any ingest that matches rows to `project_id` by name or charge code.  
- **Directory / charge-code alignment** (Account Detail Mapping) should run when SBU and group names need to match the spreadsheet roster.  
- **Finance** and **SLA** both attach to `projects`—ingest them after the project spine (and ideally after directory sync).  
- **Revenue weekly forecast + visibility** resolve **project names** like the SLA codepath; run after projects exist.  
- **Revenue pack governance** (`revenue_weekly_submission` + links) is optional; use the **governance flags** on the revenue ingest script to mark packs **approved** and to build **synthetic visibility** from forecast when you do not have a separate visibility Excel.  
- **WFM (filled 09 template)** needs **`projects` rows** whose **`account_name`** matches the sheet column **`project_id`** (it stores the **account name**, not a numeric id). Ingest WFM after the project spine (and use the **same** account naming as SLA/finance filled workbooks to avoid orphan rows).  
- **Vendor / job board licenses** (`resume_supplier_licenses`) are **org-wide** and **not** joined to `projects`. They can be ingested **any time** the DB is up (e.g. after spine, or in parallel with other ingests) without blocking on directory or project rows.  
- **Project contracts** (signup/renewal workbook) load **`project_contracts`** from sheet **Contract Data**; **`Customer`** is resolved to **`projects`** with **`resolve_project_for_sla`** (same as SLA/revenue) and **`ensure_project_client`**. Run **after** the spine (and ideally directory sync) so names match; or use **`--create-missing`** to create new **`projects` + `clients`** for unmatched `Customer` labels (use sparingly in production—prefer fixing the spine first).  
- **MoM (meetings)** from **`MoM Tracker*.xlsx`** (sheet **`MoM`**) load **`platform_meetings`** + **`meeting_action_items`**. **Organizer**, **Created By**, and **Attendees (Internal)** emails are resolved to **`users.id`**; unmatched emails are tagged to a **fallback** user (prefers `platform_admin` / `admin`, then other roles—see `backend.core.mom_tracker_ingest`). **Project / Account** uses the same project-name resolution as SLA (`resolve_project_for_sla`). Run **after** the spine (projects exist) and **after** user accounts you expect to match (or accept fallback-only tagging for unknown emails). Re-imports are **idempotent** per file basename + Excel **Meeting ID** (stored in `attachments_json`).

---

## 3. File locations in this repository (typical)

Paths are from **repo root**. In cloud, upload these workbooks to a known path (e.g. mounted volume or checkout) and point commands at that path.


| Area                                                                       | Typical paths (adjust to your bundle)                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spine (clients + projects, ORM template)**                               | `excel_files_imp/01_spine_clients_projects_filled.xlsx` or `actual_data/` copy                                                              |
| **Account / directory (charge codes, Group Name)**                         | `excel_files_imp/Account Detail Mapping.xlsx`                                                                                               |
| **Finance (filled `10_finance_core` template)**                            | `actual_data/10_finance_core_filled.xlsx` (or v3.1: `10_finance_core_filled_v3_1.xlsx` if that is your canonical name)                      |
| **SLA (filled `08_sla` template)**                                         | `actual_data/08_sla_FILLED.xlsx`                                                                                                            |
| **Finance (legacy multi-sheet workbooks, not the filled template layout)** | `excel_files_imp/FY24-25_Finance Data (2).xlsx`, `excel_files_imp/FY25-26_Finance Data (2).xlsx` (names may vary—use what operations ships) |
| **SLA (legacy Base File layout)**                                          | `excel_files_imp/Raw Data SLA Basefile.xlsx` (sheet **Base File**)                                                                          |
| **Revenue forecast**                                                       | `excel_files_imp/Revenue_Forecast_Template_1.xlsx` or `actual_data/Revenue_Forecast_Template_1 (1).xlsx`                                    |
| **Revenue visibility (optional if using separate tracker)**                | `excel_files_imp/Revenue_Visibility_Tracker.xlsx`                                                                                           |
| **WFM (filled `09` template)**                                           | `actual_data/09_workforce_management_filled (1).xlsx` — table sheets **`wfm_hr_benchmarks`**, **`wfm_resource_gaps`**; `ingest_excel_master_filled_workbooks.py --wfm` |
| **WFM (legacy “Projected HC - FY26” layout)**                              | e.g. `excel_files_imp/WFM (Projected Headcount & Revenue).xlsx` — sheet **Projected HC - FY26**; `ingest_wfm.py` or `POST /wfm/upload` (same parser) |
| **Vendor / job board license tracker (Resume Supply Chain Partner)**         | e.g. `excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx` — sheet **Job Board Tracker**; `ingest_resume_supply_chain_partner_tracker.py` (see `docs/VENDOR_LICENSE_TRACKER.md` §5.1) |
| **Contracts (Project Signup / renewal)**                                    | e.g. `actual_data/Project Signup Renewal Detail (2).xlsx` or `excel_files_imp/Project Signup Renewal Detail New.xlsx` — sheet **Contract Data**; `ingest_project_contracts.py` (ingests **`project_contracts`** only; **Sign-UpRenewal** template sheet in the workbook is usually empty and does **not** populate `project_transitions` / client onboarding milestones) |
| **MoM Tracker (meetings + action items)**                                   | e.g. `actual_data/MoM Tracker (1).xlsx` — sheet **`MoM`**; `ingest_mom_tracker_workbook.py` → **`platform_meetings`**, **`meeting_action_items`** |
| **Reports generated**                                                      | `excel_files_imp/account_mapping_sync_report.md` (from mapping sync)                                                                        |


> **Agent note:** If a file path in this doc is missing in the clone, search the repo for the filename or ask for the **operations** bundle; do not assume `actual_data/` is committed in every branch.

---

## 4. Optional: wipe data while keeping a platform admin

Only when you intentionally need a **clean slate** (destructive).

```bash
# From repo root; requires DATABASE_URL if not default SQLite
python3 backend/scripts/clear_all_data_keep_admin.py --yes
```

- Keeps users with role `platform_admin` or legacy `admin`.  
- See script header: `backend/scripts/clear_all_data_keep_admin.py` for table list.  
- After a wipe, **re-ingest in the order below**. Ensure at least one admin user can log in.

---

## 5. Recommended full sequence (recent “filled masters + governance” path)

This matches work done with `**01_spine` → directory → filled finance + filled SLA → revenue (with optional approved governance)**.

### Step 1 — Clients and projects (spine workbook)

**Script:** `backend/scripts/ingest_spine_clients_projects.py`  
**Input:** `01_spine_clients_projects` style workbook (ORM field names in row 1, hint row 2, data from row 3).  
**Tables (conceptually):** `clients`, `projects` (and links `client_id`).

```bash
python3 backend/scripts/ingest_spine_clients_projects.py --dry-run "excel_files_imp/01_spine_clients_projects_filled.xlsx"
python3 backend/scripts/ingest_spine_clients_projects.py "excel_files_imp/01_spine_clients_projects_filled.xlsx"
```

### Step 2 — Account directory + SBU alignment

**2a — Ingest directory and write sync report**  
**Script:** `backend/scripts/run_account_mapping_sync.py`  
**Input:** `excel_files_imp/Account Detail Mapping.xlsx` (or pass path as argument).

```bash
python3 backend/scripts/run_account_mapping_sync.py
# or explicit:
# python3 backend/scripts/run_account_mapping_sync.py "excel_files_imp/Account Detail Mapping.xlsx"
```

**2b — Reconcile SBU `account_name` to sheet Group Name / charge rows**  
**Script:** `backend/scripts/reconcile_mapping_clients.py`

```bash
python3 backend/scripts/reconcile_mapping_clients.py --dry-run
python3 backend/scripts/reconcile_mapping_clients.py
```

### Step 3 — Finance + SLA (filled `excel_upload_masters` workbooks)

**Script:** `backend/scripts/ingest_excel_master_filled_workbooks.py`  
**Sheets / behaviour:** table-named sheets, `_FK_REFERENCE` for finance project names, `_project_mapping_needed` for SLA; **not** the same layout as `ingest_finance.py` / raw SLA basefile.

**Tables (high level):** `finance_monthly_ledger`, `finance_cash_flow`, `finance_efficiency_kpis`, `metric_definitions`, `sla_performances` (and dedupe / SLA period backfill as implemented in script), plus with `--wfm`: `wfm_hr_benchmarks`, `wfm_resource_gaps` (project `project_id` column in the sheet = **account name**; rows are linked to `projects` via the same name resolution as SLA).

```bash
python3 backend/scripts/ingest_excel_master_filled_workbooks.py \
  --finance "actual_data/10_finance_core_filled.xlsx" \
  --sla "actual_data/08_sla_FILLED.xlsx" \
  --wfm "actual_data/09_workforce_management_filled (1).xlsx"
```

Omit `--finance`, `--sla`, or `--wfm` if you only need a subset. **WFM-only** refresh (e.g. after a revised 09 workbook, without touching 10/08):

```bash
python3 backend/scripts/ingest_excel_master_filled_workbooks.py \
  --wfm "actual_data/09_workforce_management_filled (1).xlsx"
```

Use the same filename your operations team ships; path must match the workbook on disk.

**WFM (09 template) — what gets loaded**

- **Sheets (table-named, row 1 = ORM field names):** `wfm_hr_benchmarks`, `wfm_resource_gaps`.  
- **DB tables:** `wfm_hr_benchmarks`, `wfm_resource_gaps` (and `source_filename` stamped from the file basename, as in other audit-aware ingests).  
- **Join key:** the **`project_id`** column in the sheet is the **account / project label**; the script resolves it to `projects.id` (same idea as filled SLA `client_name` / project name matching). Rows that do not match a project are reported in the script output as issues.  
- **Template semantics (sanity when comparing to `/wfm`):** in the 09 master, **WL1–WL4** are a **workload band split** of the same roster; `actual_hc_total` aligns with the sum of those bands for many portfolios. The **ingest** stores those fields as provided; the **UI** treats portfolio “projected” headcount as the **roster (actual)**, not `actual + sum(WL)` (which would double-count). Reconcile KPIs against **`ideal_hc`**, **`actual_hc_total`**, and per-band columns—not an invented “projected = actual + all WL” total from the raw sheet.

Always use **dry runs** in production first if you add a wrapper (not shown here).

### Step 4 — Revenue: weekly forecast + visibility + (optional) approved governance packs

**Script:** `backend/scripts/ingest_revenue_trackers.py`

**A — Forecast + separate visibility file (no governance)**

```bash
python3 -m backend.scripts.ingest_revenue_trackers --dry-run
python3 -m backend.scripts.ingest_revenue_trackers \
  --forecast "excel_files_imp/Revenue_Forecast_Template_1.xlsx" \
  --visibility "excel_files_imp/Revenue_Visibility_Tracker.xlsx"
```

**B — Forecast only, with synthetic visibility + `approved` weekly packs (submitter/approver = one user)**  
Use when the visibility workbook is missing but you need **Revenue pack governance** and both tracker tabs populated.

```bash
python3 -m backend.scripts.ingest_revenue_trackers \
  --forecast "actual_data/Revenue_Forecast_Template_1 (1).xlsx" \
  --forecast-only \
  --apply-governance \
  --governance-user admin@test.local
```

- Replace `admin@test.local` with a **real** user that exists in the cloud DB; that user’s id is stored on `submitted_by` / `approved_by` / `entered_by`.  
- Amounts in these templates are stored as **full INR** in the script comments—do not double-scale.  
- **Manual name overrides** (e.g. combined Siemens, Hyundai) live in the script: `MANUAL_ACCOUNT_BY_SHEET_NORM` in `backend/scripts/ingest_revenue_trackers.py`.

**API alternative:** `POST /revenue-trackers/ingest-upload` (see `backend/routers/revenue_trackers.py`).

### Step 5 — WFM (only if you did not load 09 in Step 3, or you use the legacy layout)

**Preferred path** is **Step 3** with `--wfm` (filled 09 template). Use this step only when you need the **legacy** workbook **instead of** 09, or to document the alternate entry point.

**Legacy workbook:** `backend/scripts/ingest_wfm.py` → `ingest_wfm_master` (sheet **Projected HC - FY26**, positional columns; **not** the same sheet names or column layout as the 09 `wfm_hr_benchmarks` / `wfm_resource_gaps` tables).

```bash
python3 -c "from backend.scripts.ingest_wfm import ingest_wfm_master; ingest_wfm_master('excel_files_imp/WFM (Projected Headcount & Revenue).xlsx')"
```

**API:** `POST /wfm/upload` uses the **same** legacy parser as `ingest_wfm_master` (not the 09 `ingest_excel_master_filled_workbooks.py` path). For cloud re-ingest of the **ORM 09** template, prefer the **CLI in Step 3** (or WFM-only command above), not this upload, unless you have wrapped the filled pipeline elsewhere.

### Step 6 — Project contracts (signup / renewal)

**Script:** `backend/scripts/ingest_project_contracts.py`  
**Table:** `project_contracts` (commercial snapshot per project; **Contracts** in the app).  
**Input:** Workbook with sheet **Contract Data** — header row must include **`#`**, **`Customer`**, and columns such as **Date of Signing**, **Renewal Date**, **Signed ACV (₹L)**, **Current Status**, **Practice Head** (stored as `practice_head_snapshot`), **MMF**, **Opening Fee**, **Payment Terms**, **Pricing Model**, **Detail**, **Remarks** (see script `_apply_row_to_contract` for the full map).

**Matching:** `Customer` → `resolve_project_for_sla` → `Project.id`, then `ensure_project_client` so `client_id` is set. **Upsert** behaviour: one contract row per **`project_id`** for this file basename; re-runs **update** the same logical row. If **two** `Customer` values resolve to the **same** `project_id`, the **later** data row overwrites the first—split accounts need **separate** `projects` in the spine.

```bash
python3 backend/scripts/ingest_project_contracts.py "actual_data/Project Signup Renewal Detail (2).xlsx"
# If some Customer names are not in the directory yet, optionally create Project + Client (review output):
python3 backend/scripts/ingest_project_contracts.py "actual_data/Project Signup Renewal Detail (2).xlsx" --create-missing
```

Writes `contract_workbook_ingest_report.md` next to the workbook unless **`--no-report`**.

**API:** `POST /contracts/upload` (multipart `file`); query **`create_missing_projects`** = `true` | `false` (same as **`--create-missing`** on the CLI).

**Not in scope of this ingest:** the **Sign-UpRenewal** sheet (signup/renewal line-item template) does **not** load **`project_transitions`** (client onboarding milestones) unless you add a separate pipeline; the standard workbook is **Contract Data** only.

### Step 6b — Vendor / job board license tracker (optional)

**Org-level** table `resume_supplier_licenses` (UI: **Analytics → Vendor licenses**). **No** `project_id` — safe to run without waiting on spine/projects.

**Script:** `backend/scripts/ingest_resume_supply_chain_partner_tracker.py`  
**Input:** *Resume Supply Chain Partner* / *JOB BOARD / VENDOR LICENSE TRACKER* `.xlsx` (sheet **Job Board Tracker**, header with `#` and **Job Board / Vendor**; **TOTAL** / legend rows skipped). See column map in `docs/VENDOR_LICENSE_TRACKER.md` §5.

**Default** = upsert on (`fiscal_year_label`, `vendor_name`) parsed from the sheet. Use **`--replace-fy`** to delete **all** existing rows for that fiscal year, then insert (clean mirror of the tracker for that FY).

```bash
python3 backend/scripts/ingest_resume_supply_chain_partner_tracker.py --dry-run \
  "excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx"
python3 backend/scripts/ingest_resume_supply_chain_partner_tracker.py --replace-fy \
  "excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx"
```

**API:** `POST /vendor-licenses/ingest-upload` (multipart `file`; query: `replace_fy`, `dry_run`) — same core logic.

**Not** a substitute for a seed-only smoke test: `seed_vendor_licenses_fy2026` (Step 7 table) is a **fixed** FY demo set. Prefer the **xlsx ingest** for production re-ingest when the tracker file is the source of truth.

### Step 6c — MoM Tracker (meetings + action items) (optional)

**Script:** `backend/scripts/ingest_mom_tracker_workbook.py`  
**Core logic:** `backend/core/mom_tracker_ingest.py` (`ingest_mom_workbook`)  
**Input:** *MoM Tracker* `.xlsx` with sheet **`MoM`** (row 0 = column headers, e.g. **Meeting ID**, **Meeting Title**, **Organizer**, **Created By**, **Attendees (Internal)**, **Project / Account**, **Action Item 1** columns, etc.).

**Tables:** `platform_meetings` (and **`attachments_json`** holds import metadata: `mom_import`, `source_excel_meeting_id`, `source_filename`, `tagged_user_ids`), `meeting_action_items` (first action block when present).

**Prerequisites:** at least one **active user** in the DB (fallback for emails not found); **projects** for **Project / Account** cells (spine/resolve path should already be loaded—same `resolve_project_for_sla` + `ensure_project_client` as SLA-style ingests). Organizer / creator / internal attendee **emails** are matched to **`users.email`** case-insensitively.

**Idempotency:** re-running the **same** workbook path re-**updates** rows previously imported from that file (matched by basename + Excel **Meeting ID** in `attachments_json`).

```bash
python3 backend/scripts/ingest_mom_tracker_workbook.py --dry-run "actual_data/MoM Tracker (1).xlsx"
python3 backend/scripts/ingest_mom_tracker_workbook.py "actual_data/MoM Tracker (1).xlsx"
```

There is no dedicated multipart upload API for this path in the runbook; use the **CLI** (or call `ingest_mom_workbook` from a private ops wrapper) in cloud when the xlsx is on disk.

### Step 7 — Other optional seeds (not source-of-truth “ingest”)


| Purpose                                        | Command / location                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Demo revenue (only if you lack real workbooks) | `python3 -m backend.scripts.seed_revenue_trackers` — see `backend/scripts/seed_revenue_trackers.py`                   |
| Governance vertical demo users (if needed)     | `python3 -m backend.scripts.seed_dummy_governance_profiles` — see `backend/scripts/seed_dummy_governance_profiles.py` |
| Vendor license **seed** (fixed FY demo set, not the xlsx)                   | `python3 -m backend.scripts.seed_vendor_licenses_fy2026` — only if you are **not** loading `Resume Supply Chain Partner_Tracker.xlsx` via **Step 6b**; see `docs/VENDOR_LICENSE_TRACKER.md`     |


Do **not** run demo seeds in production if they conflict with real ingested data.

---

## 6. Alternate sequence (legacy corporate workbooks)

Use when operations ships **Raw Data SLA Basefile** and **FY24-25 / FY25-26 Finance Data** (multi-sheet) instead of the **filled 10/08** templates.

1. `run_account_mapping_sync.py` (+ `reconcile_mapping_clients.py` as needed) on **Account Detail Mapping.xlsx**
2. `python3 backend/scripts/ingest_sla.py "excel_files_imp/Raw Data SLA Basefile.xlsx"`
3. `ingest_finance_master("…/FY24-25_Finance Data (2).xlsx")` (and FY25-26 as required)—see `docs/DATA_INGESTION_RUNBOOK.md` §6 for the exact Python one-liner
4. `ingest_revenue_trackers.py` (and governance flags as in §5)
5. **WFM** — by default this stack uses the **legacy** `ingest_wfm.py` / **Projected HC - FY26** file (see `docs/DATA_INGESTION_RUNBOOK.md`). If the source of truth is the **filled 09** workbook instead, run `ingest_excel_master_filled_workbooks.py --wfm` (after **projects** exist), **not** the legacy and 09 pipelines together without a plan.
6. `ingest_project_contracts.py` on **Project Signup Renewal Detail** (`Contract Data`) — as **§5 Step 6**; then budget/forecast API as in `docs/DATA_INGESTION_RUNBOOK.md` if needed  
7. (Optional) **Vendor licenses** from `ingest_resume_supply_chain_partner_tracker.py` — as in **§5 Step 6b** (xlsx) **or** `seed_vendor_licenses_fy2026` if you rely on the seed shortcut instead  
8. (Optional) **MoM Tracker** — `ingest_mom_tracker_workbook.py` (sheet **MoM**) after spine and **users** — as **§5 Step 6c**

**Do not** blindly run both **legacy finance** and **filled `10_finance_core`** on the same environment without a cleanup strategy—they target the same business domain with different layouts.

---

## 7. Post-ingest checks (smoke)


| Check            | What to verify                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects         | `GET /projects` or DB: expected `account_name` / `charge_code` count                                                                               |
| Finance          | Executive dashboard or `GET /finance/data` for FY rows                                                                                             |
| SLA              | `GET /sla/...` or SLA Performance UI for a known project                                                                                           |
| WFM              | `GET /wfm/stats`, `GET /wfm/data` (or **Workforce Management** UI): headcount KPIs line up with **`ideal_hc` / `actual_hc_total`** for a known account; 09 re-ingest did not require legacy `/wfm/upload` |
| Vendor licenses  | `GET /vendor-licenses` (or **Vendor licenses** UI): row count and **Σ License cost** match the **Job Board Tracker** sheet; skip duplicate **`seed_vendor_licenses_fy2026`** if you ingested the xlsx in **Step 6b** |
| Contracts        | `GET /contracts` (or **Contracts** UI): rows for expected accounts; **`customer_name` / `signed_acv_inr`** line up with **Contract Data**; review ingest **`missing_customer_no_project`** (if non-empty, re-run with **`--create-missing`** only after policy approval, or add projects via spine) |
| Meetings (MoM)   | **Meetings** UI or DB: `platform_meetings` rows for expected Excel **Meeting ID**s; `organizer_user_id` / `created_by_user_id` and **`attachments_json` → `tagged_user_ids`** match resolved users; **`unmatched_project_accounts`** empty or reviewed if **Project / Account** names did not resolve |
| Revenue trackers | Revenue Forecast + Visibility for a week present in the workbook; governance queue shows **All** and **Approved** if you used `--apply-governance` |
| Governance       | Use filter **All** on **Revenue pack governance**; “Needs review” will hide **approved** packs                                                     |


UI note: the **governance week** and **Visibility as-of** must match the **week_start_date** and **Update Date** in the template (e.g. FY25 template dates vs current calendar in the app).

---

## 8. One-page ordered checklist (copy for run tickets)

1. [ ] `cd` to **repo root**; set `DATABASE_URL` if needed.
2. [ ] (Optional) `python3 backend/scripts/clear_all_data_keep_admin.py --yes`
3. [ ] `ingest_spine_clients_projects.py` — `01_spine_clients_projects_filled.xlsx`
4. [ ] `run_account_mapping_sync.py` — `Account Detail Mapping.xlsx`
5. [ ] `reconcile_mapping_clients.py` (dry-run then real)
6. [ ] **Either** `ingest_excel_master_filled_workbooks.py` (10 + 08 + **`--wfm`** to `09_workforce_management_filled (1).xlsx` when WFM is in scope) **or** legacy `ingest_finance` + `ingest_sla` (see §6) — if using legacy stack, add WFM via step 8
7. [ ] `ingest_revenue_trackers.py` (add `--apply-governance` if approved packs + synthetic visibility are required)
8. [ ] (Only if **not** using 09 in step 6) **Legacy WFM:** `ingest_wfm.py` or `/wfm/upload` — path explicit; do **not** also assume 09 filled data unless you have a merge/cleanup plan
9. [ ] `ingest_project_contracts.py` — e.g. `actual_data/Project Signup Renewal Detail (2).xlsx` (add **`--create-missing`** only if policy allows auto-creating projects for orphan `Customer` names)
10. [ ] (Optional) **Vendor licenses:** `ingest_resume_supply_chain_partner_tracker.py` with `Resume Supply Chain Partner_Tracker.xlsx` (see **§5 Step 6b**); do **not** also run `seed_vendor_licenses_fy2026` unless you need the fixed demo set instead
11. [ ] (Optional) **MoM Tracker:** `ingest_mom_tracker_workbook.py` — `actual_data/MoM Tracker (1).xlsx` (or ops bundle name), **after** spine + **users** exist (see **§5 Step 6c**)
12. [ ] Spot-check UI + `docs/DATA_INGESTION_RUNBOOK.md` for API equivalents.

---

## 9. Changelog


| Date       | Note                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 2026-04-24 | Initial runbook: spine, filled masters, revenue governance, cross-refs. **WFM:** `wfm_hr_benchmarks` / `wfm_resource_gaps` sheets, WFM-only CLI, 09 vs `ingest_wfm` + `/wfm/upload`, `project_id` = account name, post-ingest `GET /wfm/stats` & `GET /wfm/data`, idempotency/ordering in §2–§3 and alternate §6. |
| 2026-04-25 | **Vendor / job board licenses:** `Resume Supply Chain Partner_Tracker.xlsx` → `resume_supplier_licenses` via `ingest_resume_supply_chain_partner_tracker.py` and `POST /vendor-licenses/ingest-upload` (**Step 6b**); `VENDOR_LICENSE_TRACKER.md` cross-ref; distinguish xlsx ingest vs `seed_vendor_licenses_fy2026`; checklist + smoke + alternate §6 item 7. |
| 2026-04-26 | **Contracts:** `Project Signup Renewal Detail` workbook — **Step 6** expanded (`Contract Data` → `project_contracts`, `resolve_project_for_sla`, `ensure_project_client`, `--create-missing` / `create_missing_projects`, one row per `project_id` upsert, Sign-UpRenewal vs onboarding note); `actual_data/…(2).xlsx` in file table; §2 order; post-ingest + checklist. |
| 2026-04-28 | **MoM Tracker (meetings):** `actual_data/MoM Tracker (1).xlsx` (sheet `MoM`) → `ingest_mom_tracker_workbook.py` / `mom_tracker_ingest` — **Step 6c**; `platform_meetings` + `meeting_action_items`, email → `users.id` + `tagged_user_ids` in `attachments_json`, `resolve_project_for_sla` for Project/Account; §2/§3/§5/§7/§8 + alternate **§6**; CLI-only note. |


When you add a new production ingest script, append a row to the checklist (§8) and link the script here.