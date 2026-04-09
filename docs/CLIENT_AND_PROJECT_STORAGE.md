# Client and project (SBU) storage — implementation update

This document describes **how legal clients, SBU-level projects, and related metadata are stored, migrated, exposed by the API, and surfaced in the UI** after the client hierarchy work.

---

## 1. Concepts


| Term                         | Meaning in the platform                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client** (`clients` row)   | Legal / rollup account used for official grouping (e.g. **TATA**). One client can own many operational projects.                                                                                                          |
| **Project** (`projects` row) | Operational unit: trackers, requisitions, finance ledger rows, WFM/SLA linkage, revenue logic, etc. Maps to an **SBU / engagement** when multiple projects sit under one client (e.g. **TATA Motors**, **TATA Finance**). |
| **Single-account case**      | e.g. **Wipro** with one engagement: one `Client` and one `Project`, both linked via `project.client_id`.                                                                                                                  |


Legacy behavior used `**project.account_name`** alone as a loose “client” label. That field remains important for **finance master matching** and many existing flows; the new model adds an explicit **parent client** and an optional **SBU label**.

---

## 2. Database

### 2.1 `clients`


| Column          | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `id`            | Primary key (used in URLs: `/clients/{id}`).                                |
| `official_name` | Display and rollup name for the legal client (indexed).                     |
| `short_code`    | Optional short identifier (indexed).                                        |
| Audit mixin     | `system_created_at`, `system_updated_at`, `source_filename`, `uploaded_by`. |


Deleting a client is **`RESTRICT`**ed if projects still reference it (`projects.client_id`).

### 2.2 `projects` (new / relevant columns)


| Column            | Purpose                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client_id`       | FK → `clients.id`. Every project should have this set after bootstrap or first save.                                                                                  |
| `engagement_name` | SBU / business-unit label (e.g. “TATA Motors”). Optional; used for display and disambiguation.                                                                        |
| `account_name`    | Existing string used across ingest, finance, SLA, and search. Often aligned with the **SBU** name or workbook naming—not always identical to `clients.official_name`. |
| `charge_code`     | Strong key for directory ingest (preferred match in project master).                                                                                                  |


All **transactional data** (records, finance monthly ledger, cashflow, KPIs, candidates, etc.) continues to key off `**project_id`**, not `client_id`.

---

## 3. Bootstrap, migration, and runtime linking

### 3.1 SQLite migration

On startup, `**init_db()**` runs `**_ensure_clients_and_project_client_columns()**`, which adds `**client_id**` and `**engagement_name**` to `projects` if they are missing (existing SQLite deployments).

The `**clients**` table is created via SQLAlchemy `**create_all**` when the `Client` model is present.

### 3.2 Backfill: `backfill_client_project_links`

After migrations, `**backfill_client_project_links(db)**` runs inside `**init_db()**`:

- For each `**Project**` with `**client_id IS NULL**`:
  - Creates a new `**Client**` whose `**official_name**` is derived from `**account_name**`, else the project `**filename**` basename, else `**Project {id}**`.
  - Sets `**project.client_id**`.
  - If `**engagement_name**` is empty, sets it from `**account_name**` when present.

**Effect:** every legacy project gets its **own** client row initially. This avoids wrongly merging unrelated projects that shared a similar name. **Consolidation** (e.g. two SBUs under TATA) is a deliberate **API / directory** step (see §6).

### 3.3 `ensure_project_client(db, project)`

Used whenever a **new** `Project` is created in code paths that might not run the full `init_db` backfill in the same transaction:

- If `**client_id`** is already set and the client exists → returns that client.
- Otherwise creates a `**Client**`, assigns `**project.client_id**`, and seeds `**engagement_name**` from `**account_name**` when appropriate.

**Call sites include:** Express/Pro upload project creation, **corporate finance ingest**, **SLA ingest**, **WFM ingest**, and **project master ingest** when parent client columns do not assign a client.

---

## 4. API

### 4.1 Clients


| Method  | Path                   | Purpose                                                                                                                                                                             |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/clients`             | Create a legal client (`official_name`, optional `short_code`). Logged to activity.                                                                                                 |
| `GET`   | `/clients`             | **Scoped** list: each item is `{ id, official_name, short_code, projects: [...] }`. Projects are the same shape as `**GET /projects`** rows (including `**client_official_name**`). |
| `GET`   | `/clients/{client_id}` | Detail for one client + scoped `**projects**` list.                                                                                                                                 |
| `PATCH` | `/clients/{client_id}` | Update `**official_name**` / `**short_code**`.                                                                                                                                      |


**Access:** `**assert_client_access`** — the user must have at least one **assigned** `project_id` whose `**client_id`** matches (admins / unrestricted roles unchanged).

### 4.2 Projects


| Method  | Path                     | Notes                                                                                                                                              |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/projects`              | Includes `**client_official_name**` when `client_id` is set; may call `**ensure_project_client**` for rows still missing `client_id`, then commit. |
| `GET`   | `/projects/{project_id}` | Dict response with column values + `**client_official_name**`.                                                                                     |
| `PATCH` | `/projects/{project_id}` | Extended with optional `**client_id**` (must exist) and `**engagement_name**`.                                                                     |


Use `**PATCH /projects/{id}**` to **move** an SBU under a shared legal client after `**POST /clients`**.

### 4.3 Auth helpers (`backend/auth/scope.py`)

- `**assert_client_access**` — gate client-level routes.
- `**account_accessible**` — for SLA-style checks by name: matches either `**Project.account_name**` **or** `**Client.official_name`** (case-insensitive) against projects the user can access.

---

## 5. Ingest and directory uploads

### 5.1 Project master Excel (`ingest_project_master.py` / `POST /projects/metadata/upload`)

Existing columns still map to project directory fields (charge code, group name / account name, heads, region, etc.).

**Optional columns** for the hierarchy:


| Header aliases (case-insensitive)                        | Effect                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Parent Client, Legal Client, Client Group, Rollup Client | Find or create `**Client`** by `**official_name**`, set `**project.client_id**`. |
| SBU, Business Unit, Engagement                           | Set `**project.engagement_name**`.                                               |


If `**client_id**` is still unset after row processing, `**ensure_project_client**` runs for that project.

### 5.2 Corporate finance (`ingest_finance.py`)

`**get_project**` still resolves primarily by `**Project.account_name**` (normalized). On **create**, or if `**client_id`** is null, `**ensure_project_client**` runs so finance-created projects are linked to a client row.

### 5.3 SLA / WFM

When a new `**Project**` is created from SLA or WFM rows, `**ensure_project_client**` runs after flush (and existing projects with null `**client_id**` are fixed the same way).

---

## 6. Operational pattern: one legal client, multiple SBUs

1. **Create the legal client:** `POST /clients` with `"official_name": "TATA"` (note returned `**id`**).
2. **Attach each SBU project:** `PATCH /projects/{sbu_project_id}` with `"client_id": <TATA id>` and optionally `"engagement_name": "TATA Motors"` / `"TATA Finance"`.
3. **Keep finance / trackers consistent:** ensure workbook `**Project` / `Account` / `Client`** columns and `**account_name**` on the project match how finance ingest matches rows (typically the **SBU** or charge code, not only the legal parent name).

**Wipro-style single engagement:** one client + one project, or rely on backfill (one client per project) and optionally rename `**official_name`** via `**PATCH /clients**`.

---

## 7. Frontend

- **Clients hub** loads `**GET /clients`** and navigates to `**/clients/{numericClientId}**`.
- **Client detail** loads `**GET /clients/{id}`** for numeric IDs.
- **Legacy URLs** using an encoded **name** (old bookmarks) still work by falling back to `**GET /projects`** and grouping with `**clientsVm**` (inferred grouping; negative synthetic ids in the view-model indicate inferred mode).

The UI distinguishes **structured multi-SBU** clients (real `**Client.id`**) from **legacy inferred** merges (name-only grouping).

---

## 8. Caching (frontend)

`queries.patchProjectMetadata` invalidates `**projects`**, `**clients**`, and `**client/**` cache prefixes so client rollups refresh after reassigning `**client_id**`.

---

## 9. Commercial contracts (`project_contracts`)

Separate from the finance ledger: table **`project_contracts`** holds signup / renewal / commercial snapshots per **project (SBU)**.

- **Keys:** `project_id` → `projects.id` (ON DELETE CASCADE). Optional `client_id` → `clients.id` (ON DELETE SET NULL).
- **API:** `GET /contracts`, `GET /contracts/by-project/{project_id}`, `GET /contracts/{id}`, `POST /contracts`, `PATCH /contracts/{id}`, `DELETE /contracts/{id}`, `POST /contracts/upload` (multipart `.xlsx`). Non-admin users are scoped by assigned projects.
- **CLI:** `python backend/scripts/ingest_project_contracts.py "<path>.xlsx"`.
- **Workbook:** reads sheet **Contract Data**; matches **Customer** to **`projects.account_name`** (case-insensitive). **Signed ACV (₹L)** is stored as **`signed_acv_inr`** (value × 100 000).

**Client detail → Account info** shows a **Commercial contracts** table per linked project.

---

## 10. Related documentation

- **`FINANCE_METRICS_AND_UPDATES_REFERENCE.md`** (repo root) — finance KPIs and ledger; amounts there remain ledger-based, not contract ACV.
- This file covers **client vs SBU identity**, **contracts**, and related **API/UI**.

---

*Last updated to match client / SBU hierarchy and `project_contracts` in the repository.*