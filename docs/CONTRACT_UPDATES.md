# Contract management — implementation reference

This document describes the **commercial contract** feature: the `project_contracts` data model, **API**, **Contract management** UI (`/client-contracts`), **renewal / alert behaviour** (derived in the browser, not push notifications), and **workbook import** coverage.

For **client vs SBU identity** and project linking, see `CLIENT_AND_PROJECT_STORAGE.md`.

---

## 1. Scope

- **In scope:** Per–project (SBU) contract rows: dates, ACV, commercial terms, renewal metadata, source mix, sign-off fields, etc.; **client-first** creation (new legal client + one or more projects under it) with org tags; hierarchy tags on clients and projects.
- **Out of scope:** Automated email/SMS/cron alerts and amendment versioning. **Binary MSA/contract file storage** is not implemented end-to-end: the **New client + projects** flow lets users pick a file per engagement; the **filename** is written to `sow_msa_reference` when that field would otherwise be empty (server upload pipeline can be added later).

---

## 2. Storage (`project_contracts`)

Each row is tied to `**project_id`** (required). Optional `**client_id**` mirrors the project’s client when set.


| Group                     | Columns                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                  | `customer_name`, `account_type` (e.g. RPO), `practice_head_snapshot`                                                                                                                   |
| Dates                     | `contract_start_date`, `contract_end_date`, `renewal_reminder_date`, `duration_months`                                                                                                 |
| Commercial (INR / ratios) | `signed_acv_inr`, `signed_cm_pct`, `agreed_rate_fee_inr`, `est_annual_value_inr`, `revenue_run_rate_inr`, `pricing_model`, `payment_terms`                                             |
| Delivery                  | `headcount_contracted`, `hiring_volume`, `positions_contracted`, `positions_filled`, `taggd_source_mix`, `other_source_mix`, `overall_rph`, `mmf_applicable`, `opening_fee_applicable` |
| Legal / SLA               | `sow_msa_reference`, `sla_terms_summary`, `client_signoff_authority`, `internal_signoff` (column retained; **not shown** in the new-contract sheet UI)                                                                                               |
| Renewal / narrative       | `contract_status`, `renewal_status`, `reason_for_lapse`, `contract_detail`, `remarks`                                                                                                  |
| Audit                     | `system_created_at`, `system_updated_at`, `source_filename`, `uploaded_by`                                                                                                             |


**Note:** There is a single numeric field `**overall_rph`** (no separate “RPH number” column). **Project name** and **SBU label** come from the linked `**projects`** row (`account_name`, `engagement_name`), not duplicated on the contract row.

---

## 3. API


| Method   | Path                                 | Purpose                                                             |
| -------- | ------------------------------------ | ------------------------------------------------------------------- |
| `GET`    | `/contracts`                         | List contracts (scoped to the user’s projects; capped server-side). |
| `GET`    | `/contracts/by-project/{project_id}` | Contracts for one project.                                          |
| `GET`    | `/contracts/{id}`                    | Single row.                                                         |
| `POST`   | `/contracts`                         | Create (`project_id` required; other fields optional).              |
| `POST`   | `/clients/{client_id}/projects`      | Create a **directory project** under a client (engagement name, hierarchy tags, optional `project_head_user_id`); sets user access. See §3.1. |
| `PATCH`  | `/contracts/{id}`                    | Partial or full update; same field set as create.                   |
| `DELETE` | `/contracts/{id}`                    | Remove row.                                                         |
| `POST`   | `/contracts/upload`                  | Multipart `.xlsx` — see §6.                                         |


Implementation: `backend/routers/project_contracts.py`. Pydantic models `**ProjectContractCreate**` / `**ProjectContractPatch**` align with the columns above.

Client and project creation under a client are implemented in `backend/main.py` (e.g. `create_client`, `create_project_under_client`). Hierarchy tag fields on `Client` and `Project` are defined in `backend/db/database.py` (`hierarchy_tag_bu`, `hierarchy_tag_sbu`, `hierarchy_tag_sbg`, `hierarchy_tag_sbe`).

### 3.1 Client-first project creation (`POST /clients/{client_id}/projects`)

- Creates a **new project** linked to the client, with optional **per-project** BU/SBU/SBG/SBE tags (empty values inherit from the client when the frontend sends normalized `null`).
- **Project head:** `project_head_user_id` sets the head on the project and upserts a `UserProjectAssignment` so that user has access.
- **Access control:** `assert_client_access` in `backend/auth/scope.py` allows users who can see a client to **bootstrap the first project** when that client has **no projects yet** (required for “create client, then add projects”).

---

## 4. UI — Contract management (`/client-contracts`)

**Route:** `frontend/src/pages/ClientContracts.tsx` (also wired in `App.tsx`, nav/auth in `auth.tsx` / `persona.tsx`).

### 4.1 Tabs

1. **Portfolio** — searchable, status-filtered grid of all scoped contracts; horizontal scroll for wide columns.
2. **Renewals & alerts** — contracts **with an end date**, sorted by `**contract_end_date`** ascending; extra columns for reminder, renewal status, est. annual, remarks.
3. **Import workbook** — upload `Project Signup Renewal Detail.xlsx` (or same **Contract Data** layout).

### 4.2 KPI strip (derived client-side)

- **Contracts on file** — count of scoped rows.
- **Active / renewed / expired** — counts where `**contract_status`** normalizes to `active`, `renewed`, `expired` (case-insensitive).
- **Σ Signed ACV** — sum of `**signed_acv_inr`** where present.
- **Renewal radar** — `**expiring90`** = rows whose end date is **today → +90 days**; `**overdue`** = end date **before today** and status **not** `renewed`.

### 4.3 Portfolio table (high level)

Includes: ID, customer, SBU/project (PRJ id + label), legal client link, type, practice head, status, start/end, **renewal reminder**, duration (months), positions filled/contracted, ACV, CM%, agreed fee, est. annual, run rate/month, pricing (truncated with tooltip).

Row click opens the **detail** dialog.

### 4.4 Detail dialog

- **View:** Read-only sections (identity, dates, commercial, delivery, legal/SLA, provenance when present).
- **Edit:** Same field set as **New contract**, grouped (identity, dates, commercial, delivery, legal). **Cancel edit** restores values from the loaded row.
- **Delete:** Confirms then calls `DELETE /contracts/{id}`.

### 4.5 New contract — side sheet (`NewContractSheet`)

The **Create contract** action opens a **right-side sheet** (light theme, styles in `frontend/src/styles/new-contract-panel.css`). The sheet is wide on desktop (overrides default Radix `SheetContent` width so the stepper and forms are usable).

#### Flow toggle

Two modes (pill switch at the top):

| Mode | Purpose |
| ---- | ------- |
| **Existing PRJ** | Pick an **existing** project, then **create one contract row** for it. Same four steps as before: **Project → Identity → Dates → Commercial** (collapsible sections match the legacy “new contract” layout). There is **no** inline “create legal client & link” block here; use **New client + projects** to create a client and PRJs first. |
| **New client + projects** | **Client-first:** create a **legal client**, then **one or more engagements** (each becomes a project + contract row). **Five steps:** **Client → Identity → Dates → Commercial → Review**. |

#### New client + projects — step summary

1. **Client** — Official name, short code, lifecycle (prospect/active), default **BU / SBU / SBG / SBE** tags. **Duplicate warning:** if the typed name is similar to an existing client in `clientGroups`, an amber alert appears (informational; does not block submit).  
   **Stacked engagement cards:** each row has engagement name, optional per-engagement tag overrides, and **Project head** via a **searchable user picker** (same visual pattern as the project dropdown: trigger, search field, scrollable list with initials avatar + email + role). Selecting a head fills `practice_head_snapshot` when empty and grants access via the API when the project is created.  
2. **Identity** — Per engagement: pipeline stage, customer name, contract type, current status, renewal status.  
3. **Dates** — Per engagement: start/end, renewal reminder, duration (auto + optional override).  
4. **Commercial** — Per engagement: ACV, CM%, pricing model, SOW/MSA reference, payment terms, and **MSA / contract document** upload (filename used for `sow_msa_reference` if not set manually).  
5. **Review** — Summary and **Create client & projects** (creates client → `POST /clients/{id}/projects` per engagement → `POST /contracts` per project).

**Removed from the new-contract UI:** internal sign-off authority (field remains in the model for legacy rows). **Reason for lapse** remains optional / deprioritized in the form layout.

### 4.6 New contract — existing-PRJ flow only (legacy one-row create)

- **Project (required)** — searchable project picker (same `ncp-project-*` pattern).
- **All other contract fields** — optional at create; same grid as edit. Default **Current status** prefilled to `Active` when opening the dialog.

### 4.7 Signed CM% (UI ↔ API)

Users may enter **whole percent** (e.g. `32`) or **fraction** (e.g. `0.32`). On save, values **greater than 1** are divided by **100** before `PATCH`/`POST` so storage stays consistent with fractional CM.

Display uses a shared formatter: values already stored **> 1** are treated as whole percent for display; otherwise multiplied to a percent.

---

## 5. Renewals & alerts — behaviour (important)

### 5.1 What is *not* automated

- **No** scheduled jobs, **no** email/push/in-app notification service, **no** server-side “alert queue.”
- Anything labelled “alert” or “renewal radar” is **computed when the page loads** from current DB values.

### 5.2 What *is* automated (display only)


| Behaviour              | Rule                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Renewal radar ≤90d** | `contract_end_date` in range **[today, today+90]** (inclusive of boundaries as implemented in the UI).                           |
| **Overdue**            | `contract_end_date` **< today** and normalized `**contract_status` ≠ `renewed`**.                                                |
| **Portfolio badges**   | **≤30d** if days until end ∈ **[0, 30]**; **Past end** if end **< today** (badge styling; status tag still shows stored status). |
| **Renewals tab sort**  | Rows filtered to those with an end date, sorted by `**contract_end_date`** ascending.                                            |


### 5.3 Input required for renewals to be meaningful


| Goal                   | User / system input                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Timeline & counts      | Maintain `**contract_end_date**` (create, edit, or import). Without it, the renewals list and day-based KPIs skip or show **—**.                                                                 |
| Explicit reminder date | `**renewal_reminder_date`** — **manual** in UI; standard **Contract Data** ingest does **not** map this column today.                                                                            |
| Pipeline labels        | `**renewal_status`**, `**contract_status**`, `**reason_for_lapse**`, **remarks** — manual in UI; import only if the workbook contains matching headers and the ingest script maps them (see §6). |


---

## 6. Workbook import (`ingest_project_contracts.py` / `POST /contracts/upload`)

- **Sheet name:** `Contract Data`.
- **Header row:** Detected when column A is `#` and **Customer** appears in the row.
- **Project match:** **Customer** cell → `**projects.account_name`** (trimmed, case-insensitive). Unmatched customers are reported in the API response; those rows are skipped.
- **Signed ACV (₹L)** → stored as `**signed_acv_inr`** (value × **100 000**).

**Columns mapped in script today** (others remain null until edited in UI): Customer, Account Type, Date of Signing → start date, Renewal Date → end date, Signed ACV (₹L), Current Status, Signed CM%, HC (Headcount), Hiring Volume, Taggd Source MIX, Other Source Mix, Overall RPH, MMF, Opening Fee, Payment Terms, Pricing Model, Detail, Remarks.

**Not populated by this ingest** (use UI or extend script): e.g. `**renewal_reminder_date`**, `**duration_months**`, `**agreed_rate_fee_inr**`, `**est_annual_value_inr**`, `**sow_msa_reference**`, `**sla_terms_summary**`, `**positions_contracted` / `positions_filled**`, `**renewal_status**`, sign-off fields, `**revenue_run_rate_inr**`, `**practice_head_snapshot**`, etc.

---

## 7. Other UI surfaces

**Client detail → Account info** may show a **Commercial contracts** summary per linked project (`CLIENT_AND_PROJECT_STORAGE.md` §9). The dedicated **Contract management** page is the full CRUD + import experience.

---

## 8. Related files


| Area           | Path                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Model          | `backend/db/database.py` — `ProjectContract`                           |
| API            | `backend/routers/project_contracts.py`                                 |
| Ingest         | `backend/scripts/ingest_project_contracts.py`                          |
| Page           | `frontend/src/pages/ClientContracts.tsx`                               |
| New contract UI | `frontend/src/components/platform/NewContractSheet.tsx`, `NewContractOrgFlow.tsx`, `new-contract-panel.css` |
| Types / client | `frontend/src/lib/api.ts` — `ProjectContractRow`, `queries.*Contract`, `createClient`, `createClientProject`, client/project hierarchy tags |
| Auth / scope   | `backend/auth/scope.py` — client access for empty-client bootstrap |
| App            | `backend/main.py` — client create/patch, `POST /clients/{id}/projects` |


---

## 9. Changelog (recent)

- **New client + projects** flow: five-step wizard aligned with **Existing PRJ** (Identity, Dates, Commercial) plus **Client** and **Review**; stacked engagement cards; **searchable project-head** user picker; **duplicate client** alert; **MSA file** picker (filename → `sow_msa_reference` when empty).
- **Existing PRJ** flow: removed the redundant **Start a new legal client** inline card; client creation is only via **New client + projects** (or other app surfaces such as client detail).
- **Hierarchy tags** on clients and projects (BU/SBU/SBG/SBE); API and SQLite migration in `database.py` / `init_db` helpers.
- **Side sheet** width increased for the new contract experience (`data-[side=right]` width overrides).
- **Internal sign-off** removed from new-contract forms; **internal_signoff** column unchanged at rest.

*Last updated: 2026-04-18 — new contract sheet flows, org hierarchy tags, client-first project API, and documentation of MSA filename handling.*