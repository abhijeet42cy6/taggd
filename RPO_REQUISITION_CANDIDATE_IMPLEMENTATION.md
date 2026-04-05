# RPO requisition / candidate split — implementation reference

This document describes the **requisition-centric `records` model** extended with **RPO Requisition Tracker** fields, the new **`candidates`** table for candidate pipeline and offer/onboarding data, **API** surface area, **SQLite evolution**, **ingestion behavior** (including what was *not* changed), and **frontend** types/queries.

---

## 1. Design intent

| Layer | Role |
|--------|------|
| **`records`** | One row per **requisition / mandate** (RPO Requisition Tracker grain). Legacy “universal” columns (`candidate_name`, `position_title`, revenue fingerprinting, etc.) remain for existing ingest, monitoring, and revenue logic. |
| **`candidates`** | One row per **candidate** against a requisition: pipeline fields, offer, onboarding, extras JSON. Linked by **`record_id`** → `records.id` and **`project_id`** → `projects.id`. |
| **`client_req_id`** (on `records`) | First-class client requisition identifier (e.g. Req. ID from client template), indexed for lookup. |
| **`client_candidate_id`** (on `candidates`) | Stable candidate key **per project**; unique together with `project_id`. |

Deleting a **requisition** cascades to its **candidates**. Deleting a **project** cascades to **records** and **candidates** per ORM/FK definitions.

---

## 2. Database: `records` — columns

### 2.1 Pre-existing (unchanged purpose)

| Column | Type (SQLAlchemy) | Notes |
|--------|-------------------|--------|
| `id` | Integer PK | |
| `project_id` | Integer FK → `projects.id` | |
| `candidate_name` | String, indexed | Legacy; still used for display/ingest; can represent placeholder e.g. `REQ://{pos_id}` |
| `position_title` | String | |
| `status` | String, indexed | |
| `hiring_manager` | String | |
| `offered_ctc` | Float | |
| `joining_date` | DateTime | |
| `creation_date` | DateTime | |
| `location` | String | |
| `department` | String | |
| `additional_attributes` | JSON | Unmapped Excel columns and extras |
| `revenue_results` | JSON | Logic output (revenue, fees, status, …) |
| `global_status` | String, indexed | CLOSED, ACTIVE, PIPELINE, … |
| `fingerprint` | String, indexed | Delta-sync identity hash |
| `excel_provided_id` | String, indexed | Value from project’s `pos_id_column` |
| `excel_row_index` | Integer | 1-based row hint from last ingest |

**Audit mixin** (on `Record`): `system_created_at`, `system_updated_at`, `source_filename`, `uploaded_by`.

### 2.2 RPO requisition tracker (added)

| Column | Type | Notes |
|--------|------|--------|
| `client_req_id` | String, nullable, **indexed** | Client Req. ID |
| `rpo_client_name` | String, nullable | May mirror `project.account_name` |
| `positions_open` | Integer, nullable | |
| `rpo_priority` | String, nullable | |
| `rpo_job_type` | String, nullable | |
| `experience_years_required` | String, nullable | |
| `ctc_budget_lpa` | Float, nullable | |
| `rpo_source_of_hire` | String, nullable | |
| `rpo_sub_source` | String, nullable | |
| `profiles_sourced` | Integer, nullable | |
| `profiles_submitted` | Integer, nullable | |
| `interviews_scheduled` | Integer, nullable | |
| `offers_released` | Integer, nullable | |
| `offers_accepted` | Integer, nullable | |
| `assigned_recruiter_rpo` | String, nullable | |
| `rpo_mandate_status` | String, nullable | |
| `rpo_vertical` | String, nullable | |
| `rpo_division` | String, nullable | |
| `rpo_bu_sbu` | String, nullable | |
| `rpo_zone` | String, nullable | |
| `rpo_grade_band` | String, nullable | |
| `rpo_business_hrbp` | String, nullable | |
| `rpo_sourcer` | String, nullable | |
| `rpo_taggd_pm` | String, nullable | |
| `rpo_hiring_agency` | String, nullable | |
| `rpo_ijp_referral` | String, nullable | |
| `mandate_received_date` | DateTime, nullable | |
| `intake_date` | DateTime, nullable | |
| `first_cv_share_date` | DateTime, nullable | |
| `selection_date_req` | DateTime, nullable | |
| `loi_date_req` | DateTime, nullable | |
| `closure_date_req` | DateTime, nullable | |
| `rpo_stage` | String, nullable | |
| `ageing_days` | Integer, nullable | |
| `ageing_bracket` | String, nullable | |
| `dead_days` | Integer, nullable | |
| `tto_days` | Integer, nullable | |
| `ttf_days` | Integer, nullable | |
| `taggd_fees_amount` | Float, nullable | |
| `billing_month` | String, nullable | |
| `fy_label` | String, nullable | |
| `requisition_extras` | JSON, nullable | Merge-friendly bag for template-specific columns |

**ORM relationship:** `Record.candidates` → list of `Candidate`, `cascade="all, delete-orphan"`.

**Implementation file:** `backend/db/database.py` (`Record` class).

---

## 3. Database: `candidates` — table definition

**Table:** `candidates`  
**Constraint:** `UNIQUE (project_id, client_candidate_id)` — name in code: `uq_candidate_project_client_id`.

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | |
| `project_id` | Integer FK → `projects.id`, **ON DELETE CASCADE**, indexed | |
| `record_id` | Integer FK → `records.id`, **ON DELETE CASCADE**, indexed | |
| `client_candidate_id` | String, **NOT NULL**, indexed | Unique per `project_id` |
| `full_name` | String, nullable, indexed | |
| `contact_no` | String, nullable | |
| `email_id` | String, nullable | |
| `gender` | String, nullable | |
| `current_location` | String, nullable | |
| `qualification` | String, nullable | |
| `specialization` | String, nullable | |
| `total_experience_yrs` | Float, nullable | |
| `current_organization` | String, nullable | |
| `current_designation` | String, nullable | |
| `notice_period_days` | Integer, nullable | |
| `alternate_contact_no` | String, nullable | |
| `source_of_hire` | String, nullable | |
| `sub_source` | String, nullable | |
| `current_ctc_lpa` | Float, nullable | |
| `expected_ctc_lpa` | Float, nullable | |
| `resume_screening` | String, nullable | |
| `assigned_recruiter` | String, nullable | |
| `hiring_manager` | String, nullable | |
| `current_stage` | String, nullable, indexed | |
| `offer_ctc_lpa` | Float, nullable | |
| `offer_release_date` | DateTime, nullable | |
| `offer_acceptance` | String, nullable | |
| `expected_doj` | DateTime, nullable | |
| `actual_doj` | DateTime, nullable | |
| `selection_date` | DateTime, nullable | |
| `loi_issue_date` | DateTime, nullable | |
| `cb_closure_date` | DateTime, nullable | |
| `fingerprint` | String, nullable, indexed | Optional ingest/dedupe aid |
| `excel_row_index` | Integer, nullable | |
| `revenue_results` | JSON, nullable | |
| `global_status` | String, nullable, indexed | |
| `candidate_extras` | JSON, nullable | Merge on PATCH |
| `offer_date` | DateTime, nullable | |
| `offer_accepted_flag` | String, nullable | |
| `decline_reason` | String, nullable | |
| `joining_status` | String, nullable | |
| `checkin_30_day` | String, nullable | |
| `checkin_60_day` | String, nullable | |
| `checkin_90_day` | String, nullable | |
| `early_exit_risk` | String, nullable | |
| `offered_gross_ctc` | Float, nullable | |
| `offered_stvs` | Float, nullable | |
| `hike_pct_offered` | Float, nullable | |
| `bgv_date` | DateTime, nullable | |
| `bgv_status` | String, nullable | |
| `medical_initiation_date` | DateTime, nullable | |
| `candidate_staff_no` | String, nullable | |
| `msil_staff_no` | String, nullable | |
| `sourcer_name` | String, nullable | |
| `taggd_pm` | String, nullable | |
| `offer_onboarding_extras` | JSON, nullable | Merge on PATCH |

**Relationships:** `Candidate.project` ↔ `Project.candidates`; `Candidate.requisition` ↔ `Record.candidates`.

**Implementation file:** `backend/db/database.py` (`Candidate` class, `Project.candidates`).

---

## 4. SQLite schema evolution

### 4.1 `records` — additive migration

Function **`_ensure_records_rpo_columns()`** in `backend/db/database.py`:

- Runs **`PRAGMA table_info(records)`** and, for each missing RPO column, executes  
  `ALTER TABLE records ADD COLUMN <name> <sqlite_type>`.
- SQLite types used in `ALTER`: `VARCHAR`, `INTEGER`, `REAL`, `DATETIME`, `TEXT` (for `requisition_extras`).
- Wrapped in **try/except** with a **warning log** on failure (does not crash startup).

**Invocation:** called from **`init_db()`** immediately after **`Base.metadata.create_all(bind=engine)`**.

This supports **existing databases** created before the RPO columns existed.

### 4.2 `candidates` table

New table is created for **fresh** databases via **`create_all`**. For databases that already had `create_all` run before `Candidate` existed, **`create_all`** adds **only missing** tables on subsequent `init_db()` runs (SQLAlchemy/SQLite behavior: new models get new tables).

There is **no** separate `_ensure_candidates_*` migrator; if you need column-level ALTERs on `candidates` in the future, follow the same pattern as `_ensure_records_rpo_columns`.

---

## 5. Backend API (`backend/main.py`)

### 5.1 Serialization

**`_serialize_record_row(r, today)`**

- Copies the ORM `__dict__`, removes `_sa_instance_state`, adds computed:
  - **`req_status`**: derived from `joining_date` vs `today` (`JOINED` / `Yet to Join` / `Cancelled`).
  - **`ageing`**: days since `creation_date` if present.
- **All persisted columns** on `Record` (including RPO fields) are therefore exposed in list/detail responses after `clean()` (dates → ISO strings, NaN floats → `null`).

### 5.2 Pydantic models

| Model | Purpose |
|--------|---------|
| **`RecordRpoPatch`** | Optional fields for every RPO column plus **`requisition_extras`** (object); used for nested updates. |
| **`RecordPatch`** | Existing string/numeric/date fields + **`rpo: Optional[RecordRpoPatch]`**. |
| **`RecordCreate`** | Required `project_id`, `candidate_name`, `position_title`; optional legacy fields; **`client_req_id`**; **`rpo`**. |

### 5.3 `_apply_record_rpo_patch(r, rpo)`

- Dumps `RecordRpoPatch` with **`exclude_unset=True`**.
- Pops **`requisition_extras`**: if provided, must be a **dict**; merged shallowly into existing `r.requisition_extras`.
- Other fields: typed coercion:
  - Date fields → `_parse_optional_datetime`
  - Int / float fields → `int` / `float`
  - Strings → strip; empty → `None` where applicable
- **`None` values in the patch dict are skipped** (they do not clear columns in the current implementation).

### 5.4 HTTP routes (records)

| Method | Path | Notes |
|--------|------|--------|
| `PATCH` | `/records/{record_id}` | Applies `RecordPatch`; if **`body.rpo`** is set, calls **`_apply_record_rpo_patch`**. Logs activity **`resource_type=requisition`**. |
| `POST` | `/records` | Builds `Record` with **`client_req_id`**; if **`body.rpo`** present, applies RPO patch before insert. |
| `GET` | `/records/all`, project record listings | Rows include full `Record` columns via `_serialize_record_row`. |

**Router registration:** `candidates` router is **`include_router`**’d from `backend/routers/candidates.py` (see below).

---

## 6. Backend API: candidates router (`backend/routers/candidates.py`)

**Prefix:** `/candidates`  
**Tags:** `candidates`

**Auth / scope:** `get_current_user`; listing uses **`apply_project_scope`**; mutations use **`assert_project_access`** on the relevant `project_id`.

### 6.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/candidates` | Query: `project_id`, `record_id`, `limit` (1–500), `offset`. Returns `{ items, total, limit, offset }`. |
| `GET` | `/candidates/{candidate_id}` | Single row; 404 if missing or out of scope. |
| `POST` | `/candidates` | Body: **`CandidateCreateBody`**. Validates **`record_id`** belongs to **`project_id`**. Duplicate **`client_candidate_id`** for same project → **409**. |
| `PATCH` | `/candidates/{candidate_id}` | **`CandidatePatchBody`**. Optional **`record_id`** change validated to same project. JSON extras merged. |
| `DELETE` | `/candidates/{candidate_id}` | Hard delete; activity logged. |

### 6.2 Field typing helpers (server-side)

- **Date/datetime** fields parsed with ISO-like strings (`_parse_dt`).
- **Ints:** `notice_period_days`, `excel_row_index`.
- **Floats:** CTC/experience/hike/STVS fields listed in router `_FLOAT_FIELDS`.

### 6.3 Activity log

**`log_activity`** calls use **`resource_type="candidate"`** for create/update/delete.

---

## 7. Ingestion: Excel / processor (column mapping v2 + RPO columns)

**Primary code path:** `backend/core/processor.py` — **`ExcelProcessor.process_file_into_db`**.

### 7.1 `Project.column_mapping` shape

| Format | Stored JSON | Processor behavior |
|--------|-------------|-------------------|
| **Legacy v1** | Flat `{"candidate_name": "Candidate Name", …}` | Entire object = universal map; **`record_fields`** empty. |
| **v2** | `{"version": 2, "universal": {...}, "record_fields": {"client_req_id": "Req No", …}}` | Universal + RPO field → Excel header; see **`backend/core/column_mapping_normalize.py`**. |

Express **`POST /upload`** and Pro **`POST /upload/pro/confirm`** call **`finalize_ingest_column_mapping()`** in **`backend/main.py`**, which:

1. Takes the LLM **`ColumnMap`** (`mapping` + **`record_field_mapping`**).
2. Merges with **`merge_llm_and_heuristic_record_fields()`** in **`backend/core/record_field_synonyms.py`** (LLM wins; heuristics fill gaps; skips headers already used by universal map; one Excel column → one target).

### 7.2 Column mapper agent (`backend/agents/column_mapper.py`)

- **`ColumnMap.record_field_mapping`**: targets must be keys from **`INGESTABLE_RECORD_COLUMNS`** (see **`record_field_synonyms.py`**).
- Prompt lists all allowed RPO field names and examples (Reference ID → `client_req_id`, Job Requisition Status → `rpo_mandate_status`, etc.).

### 7.3 Heuristic matcher (`record_field_synonyms.py`)

- **`suggest_record_field_mapping(headers, universal_mapped_headers)`** scores normalized headers against weighted aliases (e.g. `reference id` → `client_req_id`, `req no` → `client_req_id`).
- Substring rules use **whole-word checks** so short headers like **`Source`** map to **`rpo_source_of_hire`** instead of false positives inside **`profiles sourced`**.
- Greedy assignment: highest score wins; each field and each header used at most once.

### 7.4 Processor application

- Splits mapping with **`split_column_mapping`**; **`all_mapped_excel_headers`** = union of all mapped Excel header strings.
- **`additional_attributes`**: every row key **not** in that set (so mapped columns are **not** duplicated in JSON).
- **`_apply_record_field_columns`**: sets **`INGESTABLE_RECORD_COLUMNS`** on `Record` with coercion (date / int / float / string) via **`field_coercion_kind`**.
- **Updates** now sync **universal** core fields too (`position_title`, `hiring_manager`, `offered_ctc`, `creation_date`, `location`, `department`) in line with creates.

### 7.5 Sample templates (observed under `excel_files/`)

| File / sheet | Example headers | Typical mappings |
|--------------|-----------------|------------------|
| **HPE** — Open Position | `Reference ID`, `Requisition Title`, `Job Requisition Status`, `Region`, `Business Unit (L2)` | `client_req_id`, `position_title`, `status`, `rpo_zone` / extras |
| **M&M** — Position Tracker | `Job Req ID`, `Job Role`, `Date Created`, `Req. Status`, `Department` | `client_req_id`, `position_title`, `creation_date`, `status`, `department` |
| **UD Trucks** — Positions Data | `Req No`, `Final Status`, `Position Title`, `HM`, `Source`, `Req Received  Date-RPO`, `Intake Meeting Date` | `client_req_id`, `status`, `position_title`, `hiring_manager`, `rpo_source_of_hire`, `mandate_received_date`, `intake_date` |
| **Birla_Paint** — Sheet1 | `ABG Req ID`, `Req Date`, `Role`, `Current Status` | `client_req_id`, `creation_date`, `position_title`, `status` |

**No `Candidate` rows** are created by this pipeline; candidate-heavy sheets still ingest as `Record` rows unless you add a separate path.

### 7.6 Other scripts under `backend/scripts/`

Unchanged for this feature: **`ingest_project_master.py`**, **`ingest_sla.py`**, **`ingest_wfm.py`**, **`ingest_finance.py`** (no `records` RPO mapping).

---

## 8. Agent tools (`backend/agent_tools/tools.py`)

- **`search_records`** and related aggregates still query **`Record`** only.
- **`Candidate`** is **not** imported in `tools.py`; there is **no** `search_candidates` tool yet.
- Extending the analysis agent to candidates would mean new tools and optional joins from `record_id` / `client_req_id`.

---

## 9. Frontend (`frontend/src/lib/api.ts`)

### 9.1 Types

- **`RecordRpoPatch`**: mirrors backend optional RPO fields + `requisition_extras`.
- **`RecordRow`**: existing row shape **intersected** with **`Partial<RecordRpoPatch>`** so GET responses can carry RPO columns.
- **`RecordPatch`**: adds optional **`rpo`**.
- **`RecordCreate`**: adds **`client_req_id`**, **`rpo`**.
- **`CandidateRow`**, **`CandidateCreate`**, **`CandidatePatch`**: aligned with API bodies/responses.

### 9.2 Query helpers (`queries`)

| Helper | Behavior |
|--------|----------|
| **`candidatesList`** | Cached GET `/candidates` with optional `project_id`, `record_id`, `limit`, `offset`. |
| **`candidate`** | GET `/candidates/{id}` |
| **`createCandidate`** | POST; invalidates cache prefix `candidates` |
| **`patchCandidate`** | PATCH; invalidates `candidates` |
| **`deleteCandidate`** | DELETE; invalidates `candidates` |
| **`deleteRecord`** | Also invalidates **`candidates`** (DB cascades remove child rows; UI cache should drop stale lists). |

**Cache TTL:** `candidates` key family uses **15s** SWR-style TTL (see `TTL_MS` in `api.ts`).

### 9.3 Activity log UI (`frontend/src/pages/ActivityLog.tsx`)

- **`RESOURCE_TYPE_LABEL`** includes **`candidate`** → display label **“Candidate”**.

---

## 10. Files touched (reference)

| Area | Path |
|------|------|
| Models, migration, `init_db` | `backend/db/database.py` |
| Record RPO patch/create, record routes, router include | `backend/main.py` |
| Candidate CRUD | `backend/routers/candidates.py` |
| Column mapping v2 + ingest | `backend/core/column_mapping_normalize.py`, `backend/core/record_field_synonyms.py`, `backend/core/processor.py`, `backend/agents/column_mapper.py`, `backend/main.py` |
| Agent DB tools (Record-only) | `backend/agent_tools/tools.py` |
| Client API types & queries | `frontend/src/lib/api.ts` |
| Activity labels | `frontend/src/pages/ActivityLog.tsx` |

---

## 11. Follow-up work (not implemented)

1. **Candidate sheet ingest**: second pass or sheet-type detection to populate **`candidates`** and link **`record_id`** (e.g. match on Req ID).
2. **Agent tools**: `search_candidates`, optional linkage summaries by requisition.
3. **UI**: requisition detail view listing candidates using **`queries.candidatesList({ record_id })`**.
4. **Clearing RPO fields via API**: today **`None` in `RecordRpoPatch` is largely skipped**; explicit “set to null” semantics would need API/design changes if required.
5. **Per-sheet `record_fields`**: v2 mapping is global across multi-sheet Pro ingest; columns with the same semantic name should align; divergent layouts may need sheet-scoped maps.

---

*Generated as an implementation reference for the RPO requisition / candidate data model and API. Update this file when ingest or agent behavior changes.*
