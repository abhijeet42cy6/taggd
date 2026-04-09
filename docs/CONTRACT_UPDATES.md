# Contract management — implementation reference

This document describes the **commercial contract** feature: the `project_contracts` data model, **API**, **Contract management** UI (`/client-contracts`), **renewal / alert behaviour** (derived in the browser, not push notifications), and **workbook import** coverage.

For **client vs SBU identity** and project linking, see `CLIENT_AND_PROJECT_STORAGE.md`.

---

## 1. Scope

- **In scope:** Per–project (SBU) contract rows: dates, ACV, commercial terms, renewal metadata, source mix, sign-off fields, etc.
- **Out of scope:** Automated email/SMS/cron alerts, amendment versioning, and file attachments (SOW/MSA text is reference strings only unless stored in text fields).

---

## 2. Storage (`project_contracts`)

Each row is tied to `**project_id`** (required). Optional `**client_id**` mirrors the project’s client when set.


| Group                     | Columns                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                  | `customer_name`, `account_type` (e.g. RPO), `practice_head_snapshot`                                                                                                                   |
| Dates                     | `contract_start_date`, `contract_end_date`, `renewal_reminder_date`, `duration_months`                                                                                                 |
| Commercial (INR / ratios) | `signed_acv_inr`, `signed_cm_pct`, `agreed_rate_fee_inr`, `est_annual_value_inr`, `revenue_run_rate_inr`, `pricing_model`, `payment_terms`                                             |
| Delivery                  | `headcount_contracted`, `hiring_volume`, `positions_contracted`, `positions_filled`, `taggd_source_mix`, `other_source_mix`, `overall_rph`, `mmf_applicable`, `opening_fee_applicable` |
| Legal / SLA               | `sow_msa_reference`, `sla_terms_summary`, `client_signoff_authority`, `internal_signoff`                                                                                               |
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
| `PATCH`  | `/contracts/{id}`                    | Partial or full update; same field set as create.                   |
| `DELETE` | `/contracts/{id}`                    | Remove row.                                                         |
| `POST`   | `/contracts/upload`                  | Multipart `.xlsx` — see §6.                                         |


Implementation: `backend/routers/project_contracts.py`. Pydantic models `**ProjectContractCreate**` / `**ProjectContractPatch**` align with the columns above.

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

### 4.5 New contract dialog

- **Project (required)** — select operational project (SBU).
- **All other contract fields** — optional at create; same grid as edit. Default **Current status** prefilled to `Active` when opening the dialog.

### 4.6 Signed CM% (UI ↔ API)

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
| Types / client | `frontend/src/lib/api.ts` — `ProjectContractRow`, `queries.*Contract`* |


---

*Last updated: contract UI (full-field create/edit/view), portfolio & renewals tables, renewal/alert semantics (derived client-side only), ingest coverage, CM% handling.*