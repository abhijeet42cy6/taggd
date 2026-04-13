# Candidate Master & Enterprise Store — Implementation Report

**Document purpose:** Describe the architecture, data model, APIs, access control, migration paths, and UI delivered for the **enterprise candidate master** program (talent identity across mandate rows), plus the **Candidates** tab and **Candidate store** experience.

**Audience:** Engineering, product, and operations configuring access in **Users & access**.

---

## 1. Executive summary

The platform historically modeled people only as **mandate-level rows** in `candidates` (one row per requisition placement, keyed by `project_id` + `record_id` + `client_candidate_id`). That design is correct for RPO pipeline tracking but does not answer “who is this person across SBUs and mandates?”

This delivery adds:

1. `**candidate_masters`** — a **logical person** (or best-effort identity) with normalized contact fields and optional consent/metadata JSON.
2. `**candidate_master_links`** — a **strict 1:1** link from each `candidates.id` to exactly one master (enforced by a unique constraint on `candidate_id`).
3. **Automatic linking** when new mandate rows are created via the API, plus **idempotent backfill** for legacy rows.
4. **Scoped HTTP APIs** for listing/searching masters using the **same visibility rules** as `GET /candidates` (project assignments + recruiter involvement).
5. **Tightened candidate detail access** for recruiters (detail/patch/delete now align with list scope).
6. **Frontend:** `**/candidates`** (pipeline table) and `**/candidate-store**` (directory + admin backfill controls), gated by the existing `**candidates**` vertical alongside `**/requisitions**`.

---

## 2. Problem statement & goals


| Goal                                             | How it is addressed                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Enterprise view of “one person, many placements” | `candidate_masters` + `candidate_master_links`                                                                          |
| Dedupe / grouping without breaking existing rows | Links attach to existing `candidates`; no destructive merge of mandate rows in v1                                       |
| Safe migration from old data                     | Backfill only **unlinked** rows; dry-run; batch tag; CLI and optional env-driven init                                   |
| Role-appropriate visibility                      | Store and list use `**visible_candidate_ids_query`** (project scope + recruiter scope)                                  |
| Client vs internal use                           | Same vertical `**candidates**` as pipeline API; client portal users only see masters that have ≥1 **visible** placement |
| Auditability                                     | Activity log entries for backfill and manual link operations                                                            |


---

## 3. Data model

### 3.1 `candidate_masters`


| Column                     | Purpose                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                       | Primary key                                                                                            |
| `display_name`             | Human label (from name / client candidate id on first link)                                            |
| `email_normalized`         | Lowercased email for matching (indexed)                                                                |
| `phone_normalized`         | Digit-normalized phone tail for matching (indexed)                                                     |
| `global_fingerprint`       | SHA-256–derived **hint** from email + phone + display string (indexed, **not** a uniqueness guarantee) |
| `consent_json`             | Reserved for GDPR / consent flags                                                                      |
| `meta_json`                | Reserved for arbitrary extensions                                                                      |
| `migration_batch_tag`      | Tags rows created by a given backfill run (`v1`, `initdb`, `cli`, etc.)                                |
| `created_at`, `updated_at` | Timestamps                                                                                             |


### 3.2 `candidate_master_links`


| Column         | Purpose                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `id`           | Primary key                                                                       |
| `master_id`    | FK → `candidate_masters.id` (CASCADE delete)                                      |
| `candidate_id` | FK → `candidates.id` (**unique** — one master per mandate row)                    |
| `link_source`  | `migration` | `auto` | `manual` (string)                                          |
| `confidence`   | Float heuristic (e.g. ~0.92 email match, ~0.78 phone, ~0.99 new singleton master) |
| `notes`        | Optional operator note (e.g. `manual_admin`)                                      |
| `created_at`   | Timestamp                                                                         |


### 3.3 ORM relationship

- `Candidate.master_link` ↔ `CandidateMasterLink` (cascade delete-orphan from candidate side for the link row).

### 3.4 Schema evolution

New tables are created through SQLAlchemy `**Base.metadata.create_all`** on application `**init_db()**` (same pattern as other platform tables). No separate Alembic revision was added; SQLite and fresh deployments pick up tables automatically. For large production Postgres deployments, teams may later add explicit migrations mirroring these definitions.

---

## 4. Identity resolution & backfill logic

**Module:** `backend/core/candidate_master_mgmt.py`

- **Email normalization:** trim, lowercase, require `@`, max 255 chars.
- **Phone normalization:** extract digits; require at least 8; keep last 15 digits for international tolerance.
- **Finding an existing master:** prefer **email match**, else **phone match** (first by `id` ordering).
- **Creating a new master:** when no identity match; sets `display_name` from `full_name` or `client_candidate_id`, stores normalized fields and fingerprint hint.
- `**ensure_master_link_for_candidate`:** idempotent; used after **POST `/candidates`**.
- `**backfill_candidate_masters`:** loads all `candidate_id`s already linked, processes remaining candidates in id order, supports `**dry_run`**, `**limit**`, `**migration_batch_tag**`, commits once at end (unless dry-run).

**Limitations (documented in code):**

- Fingerprint collisions are theoretically possible; confidence scores are advisory.
- Same human with **different** emails across mandates may get **multiple masters** until manual merge (future enhancement).
- Ingest paths that insert `candidates` outside the FastAPI router should call `**ensure_master_link_for_candidate`** if auto-linking is required there (current codebase creates candidates via `POST /candidates`).

---

## 5. Access control & security

### 5.1 Vertical gating

- `**/candidates**` and `**/candidate-masters**` both use `**require_vertical("candidates")**`.
- `**VERTICAL_TO_NAV_PATHS**` in the frontend maps vertical `**candidates**` to `**/requisitions**`, `**/candidates**`, and `**/candidate-store**` so client admins can enable all three with one checkbox where applicable.

### 5.2 Visibility of masters (store)

`**visible_candidate_ids_query**` applies:

1. `**apply_project_scope**` on `Candidate` (unrestricted for full admin; restricted to `user_project_assignments` for scoped roles; empty assignments → no rows).
2. `**apply_recruiter_candidate_scope**` for recruiters (assigned recruiter / hiring manager FK or legacy string match on email/local-part).

`**GET /candidate-masters**` returns only masters that have **at least one** linked `candidates` row whose `id` is in that visible set. Search filter `q` applies to master display name, normalized email/phone, and fingerprint.

### 5.3 Candidate row detail (recruiter fix)

`**GET/PATCH/DELETE /candidates/{id}`** now uses `**_assert_candidate_view**`, which applies the **same filters** as the list endpoint. Previously, `**assert_project_access` alone** could allow a recruiter to open any candidate on an assigned project even when not “involved” on that row.

### 5.4 Admin-only mutations on masters

- `**POST /candidate-masters/backfill`**
- `**POST /candidate-masters/{master_id}/link-candidate**`
- `**POST /candidate-masters/ensure-link/{candidate_id}**`

Protected with `**require_roles("admin", "platform_admin")**` (legacy `admin` / canonical `platform_admin`).

### 5.5 Middleware

- `**client_vertical_read_guard`:** `**/candidate-masters`** is on the skip list (same pattern as `**/candidates**`) so path-based middleware does not conflict with router-level `**require_vertical**`.

---

## 6. HTTP API reference


| Method       | Path                                            | Auth / role                         | Description                                                                                                       |
| ------------ | ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET          | `/candidates`                                   | `candidates` vertical               | Paginated mandate rows; optional `**search**`, `project_id`, `record_id`; response items include `**master_id**`. |
| GET          | `/candidates/{id}`                              | `candidates` vertical               | Detail; **scoped** view check.                                                                                    |
| POST         | `/candidates`                                   | `candidates` vertical + write rules | Creates row; **auto master link** after insert.                                                                   |
| PATCH/DELETE | `/candidates/{id}`                              | `candidates` vertical + write rules | Scoped like GET.                                                                                                  |
| GET          | `/candidate-masters`                            | `candidates` vertical               | Directory; `**q`**, pagination; placement counts per visible scope.                                               |
| GET          | `/candidate-masters/{id}`                       | `candidates` vertical               | Master + **placements** (candidate summaries) visible to user; **404** if user sees no placements (non-admin).    |
| POST         | `/candidate-masters/backfill`                   | Admin                               | Body: `dry_run`, `limit`, `migration_batch_tag`; logs activity.                                                   |
| POST         | `/candidate-masters/{id}/link-candidate`        | Admin                               | Body: `candidate_id`; replaces existing link for that candidate.                                                  |
| POST         | `/candidate-masters/ensure-link/{candidate_id}` | Admin                               | Idempotent link for one mandate row.                                                                              |


---

## 7. Migration & operations

### 7.1 CLI

**Script:** `backend/scripts/backfill_candidate_masters.py`

```text
python3 backend/scripts/backfill_candidate_masters.py [--dry-run] [--limit N] [--batch-tag TAG] [--init-db]
```

- `**--init-db`:** runs `init_db()` first (creates missing tables on empty or older DBs).

### 7.2 Optional automatic backfill on server init

**Environment variables** (see `init_db()` in `backend/db/database.py`):


| Variable                            | Effect                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| `CANDIDATE_MASTER_BACKFILL_ON_INIT` | If `1` / `true` / `yes`, runs full backfill after other init steps. |
| `CANDIDATE_MASTER_BACKFILL_TAG`     | Optional tag string (default `initdb`) stored on new masters.       |


Default is **off** to avoid unexpected load on large databases.

### 7.3 UI backfill (admins)

**Candidate store** page exposes **Dry-run backfill** and **Run backfill** for platform admins, calling `**POST /candidate-masters/backfill`**.

### 7.4 Activity log

New `**resource_type**` values for the unified activity feed:

- `**candidate_master_backfill**` — summary includes batch tag and dry-run flag; `**meta**` holds returned stats.
- `**candidate_master_link**` — manual link / ensure-link operations.

Frontend `**ActivityLog.tsx**` maps friendly labels for these types.

---

## 8. Frontend


| Route              | Page                 | Role                                                                                       |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------ |
| `/candidates`      | `Candidates.tsx`     | Users with route allow-list + `candidates` vertical (client portal included when enabled). |
| `/candidate-store` | `CandidateStore.tsx` | Same; admins get backfill controls.                                                        |


**Navigation**

- **Operations** group in `App.tsx`: **Candidates**, **Candidate store** (alongside Requisitions, etc.).
- **Recruiter** sidebar (`RECRUITER_NAV_GROUPS`): both entries under **My work**.
- `**auth.tsx`:** `ROLE_NAV_PATHS` extended for internal roles and recruiter; `**VERTICAL_TO_NAV_PATHS`** for `**candidates**` includes both paths; `**CLIENT_NAV_PRIORITY**` orders candidates near requisitions.

**API client (`frontend/src/lib/api.ts`)**

- Types: `**CandidateMasterRow`**, `**CandidateMasterDetail**`, `**master_id**` on `**CandidateRow**`.
- Methods: `**candidateMastersList**`, `**candidateMaster**`, `**candidateMasterBackfill**`; `**candidatesList**` accepts `**search**`.

---

## 9. File index (primary touchpoints)


| Area         | Files                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models       | `backend/db/database.py` (`CandidateMaster`, `CandidateMasterLink`, `Candidate.master_link`)                                                                                                       |
| Domain logic | `backend/core/candidate_master_mgmt.py`                                                                                                                                                            |
| Store API    | `backend/routers/candidate_masters.py`                                                                                                                                                             |
| Mandate API  | `backend/routers/candidates.py` (scope, search, serialize, auto-link)                                                                                                                              |
| App wiring   | `backend/main.py`                                                                                                                                                                                  |
| Read guard   | `backend/auth/client_vertical_read_guard.py`                                                                                                                                                       |
| Init hook    | `backend/db/database.py` (`init_db` env block)                                                                                                                                                     |
| CLI          | `backend/scripts/backfill_candidate_masters.py`                                                                                                                                                    |
| UI           | `frontend/src/pages/Candidates.tsx`, `frontend/src/pages/CandidateStore.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts`, `frontend/src/pages/ActivityLog.tsx` |


---

## 10. Operational analysis: empty Candidates tab, `records` vs `candidates`, and backfill strategy

**Visual guide (Mermaid):** [`docs/CANDIDATES_AND_RECORDS_LINKAGE.md`](docs/CANDIDATES_AND_RECORDS_LINKAGE.md) — entity relationships, ingest vs API paths, and how “untagged” `records` data vs new `candidates` rows are treated.

### 10.1 Why the Candidates tab can show no rows

The UI calls **`GET /candidates`**, which reads only the **`candidates`** SQL table. That table is **not** filled by the same Excel / Express ingest pipeline that populates **`records`** (requisitions / “positions”).

| Source | Table | Populated by |
|--------|--------|----------------|
| Tracker ingest, processor, most of the product surface | **`records`** | `ExcelProcessor` / `process_file_into_db` and related flows — **this is the usual “positions” DB** |
| RPO candidate pipeline API | **`candidates`** | **`POST /candidates`** (and any future code paths that insert `Candidate` rows) — **not** created automatically for every `Record` today |

So if your environment has many requisitions in **Requisitions** but **nobody has ever created `candidates` rows** (or they were never migrated), the **Candidates** tab will correctly show **zero** rows. The **Candidate store** tab will also look empty until (a) there are `candidates` rows, and (b) **master backfill** has linked them (masters are derived from `candidates`, not from `records` directly).

**Other causes of an empty list**

1. **`operations` user without `candidates` in `vertical_access_json`** — FastAPI returns **403**; the Candidates page surfaces load errors in an alert when the request fails.
2. **Scoped roles with no `user_project_assignments`** — `apply_project_scope` returns no rows (empty project set).
3. **Recruiter** — additional filter: only mandate rows where they are assigned / matched on legacy strings; can be empty even when the project has `records`.
4. **Frontend cache** — `candidatesList` uses `cachedGet` with a 15s TTL; after bulk backfill, use **Refresh** or rely on background revalidation; worst case **logout/login** clears cache.

### 10.2 How `candidates` connect to “positions” (`records`)

Data model (see `backend/db/database.py`):

- **`Record`** (`records` table): one row per **requisition / mandate / position line** on a project (what Requisitions shows).
- **`Candidate`**: optional **pipeline extension** for richer RPO fields; **required FKs**:
  - `project_id` → same project as the requisition
  - `record_id` → **must point to an existing `Record.id`** on that project

So the link is: **`Candidate` → `Record` (requisition line) → `Project`**. There is **no automatic 1:1** creation of a `Candidate` for every `Record`; they are **separate grains** until you add an ETL or ingest rule.

### 10.3 What “backfill” does today vs what you likely need

| Backfill | What it does | Prerequisite |
|----------|----------------|----------------|
| **`POST /candidate-masters/backfill`** (and CLI / optional `init_db` env) | Creates **`candidate_masters`** + **`candidate_master_links`** for rows already in **`candidates`** that lack a link | **`candidates` rows must exist** |
| **Does not** | Create `candidates` from `records` | Not implemented in v1 |

To **modernize** historical **positions** into the **candidates** table (so the tab and store populate), you need a **second stage** of migration, for example:

1. **Define mapping** from `Record` columns → `Candidate` fields (`full_name` ← `candidate_name`, `client_candidate_id` from `excel_provided_id` / `client_req_id` / synthetic `rec:{id}`, etc.).
2. **Batch insert** `Candidate` rows with valid `(project_id, record_id)` and uniqueness on `(project_id, client_candidate_id)`.
3. **Run existing master backfill** so each new `Candidate` gets a **`candidate_masters`** link.

Edge cases to design for: duplicate names, missing email/phone, records without a stable client candidate id, and idempotent re-runs (skip if `Candidate` already exists for that `record_id` if you enforce one candidate per record).

### 10.4 Recommended order of operations for your DB

1. **Verify counts:** `SELECT COUNT(*) FROM records;` vs `SELECT COUNT(*) FROM candidates;` — expect the first to be large and the second **zero** on ingest-only deployments.
2. **Access:** Ensure the user has vertical **`candidates`** (for `operations`) and project assignments where applicable.
3. **Populate `candidates`:** Implement or run **Record → Candidate** migration (not shipped in current codebase).
4. **Link masters:** Run **`candidate_masters` backfill** (UI or `backend/scripts/backfill_candidate_masters.py` or `POST /candidate-masters/backfill`).
5. **UI:** Open **Candidates** and **Candidate store** and confirm rows appear.

---

## 11. Recommendations & follow-ups

1. **Postgres / scale:** Add composite indexes matching production query patterns; consider full-text search or external search for very large `candidate_masters` tables.
2. **Merge UI:** Admin flow to merge two masters (re-point links, retire duplicate master) is not in v1.
3. **Ingest pipelines:** Either insert `Candidate` rows during tracker processing when mapping supports it, or run a dedicated **Record→Candidate** job after ingest; then call `ensure_master_link_for_candidate` where appropriate.
4. **PII & consent:** Populate `consent_json` when legal defines retention and cross-client visibility; consider redacted DTOs for `client_user` if policies require it.
5. **Observability:** Optional dedicated `candidate_store_search` audit rows if compliance requires logging every search query string.
6. **UX:** Surface `GET /candidates` errors (403/500) on the Candidates page so “no data” is not confused with “API denied”.

---

## 12. Revision history

| Date       | Author      | Change |
| ---------- | ----------- | ------ |
| 2026-03-28 | Engineering | Initial report from implemented candidate master program. |
| 2026-03-28 | Engineering | Added §10 operational analysis: empty tab, records vs candidates, two-stage backfill strategy. |


