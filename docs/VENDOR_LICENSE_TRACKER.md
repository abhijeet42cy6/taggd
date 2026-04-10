# Job board & vendor license tracker (resume supplier costs)

This document describes the **org-wide** tracker for Taggd’s **recruitment technology and sourcing spend** (job boards, resume vendors, license lines). It is **not** linked to `projects`, `clients`, or trackers.

---

## 1. Purpose

- One **database row** = one vendor / subscription line (e.g. “Naukri – HPE”, “LinkedIn”).
- Captures contract dates, inventory/posting limits where relevant, **annual or contract cost in INR**, and primary/secondary contacts.
- **Do not** store spreadsheet “TOTAL / SUMMARY” rows in the table; use **aggregates** (the UI shows **Σ License cost**) or SQL `SUM(cost_inr)`.

---

## 2. Database

**Table:** `resume_supplier_licenses`  
**Model:** `ResumeSupplierLicense` in `backend/db/database.py`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | Integer PK | Surrogate key (replaces spreadsheet `#`). |
| `vendor_name` | String(512), required, indexed | Job board / vendor label. |
| `login_ids_count` | Integer, nullable | “Login IDs” count from tracker. |
| `resume_inventory` | String(255), nullable | Free text: `300,000`, `Unlimited`, `—`, etc. |
| `job_postings` | Integer, nullable | |
| `naukri_invites` | Integer, nullable | |
| `utilization` | String(255), nullable | Placeholder until a metric is defined. |
| `start_date` | Date, nullable | |
| `end_date` | Date, nullable | |
| `contract_duration_months` | Integer, nullable | |
| `cost_inr` | Float, nullable | Store **numeric INR** only (no `₹` in DB). |
| `primary_person_*` | String, nullable | Name, phone, email. |
| `secondary_person_*` | String, nullable | Name, phone, email. |
| `remarks` | Text, nullable | e.g. “Primary ATS License”, “Client-specific”. |
| `fiscal_year_label` | String(64), nullable, indexed | e.g. `FY 2025-26`. |
| `sort_order` | Integer, default `0`, indexed | Controls list order in UI/API. |
| `created_by_user_id` | FK → `users.id`, nullable | Set on create. |
| `updated_by_user_id` | FK → `users.id`, nullable | Set on each patch. |
| `system_created_at` | DateTime | |
| `system_updated_at` | DateTime | **Last modified** (auto). |

Tables are created via `init_db()` / `Base.metadata.create_all`.

### 2.1 Seed data (FY 2025-26 tracker)

To load the standard **JOB BOARD / VENDOR LICENSE TRACKER** line items (eight vendors; **TOTAL** row is not stored):

```bash
# From repository root
python3 -m backend.scripts.seed_vendor_licenses_fy2026
```

The script is **idempotent** for this set: it deletes existing rows with `fiscal_year_label = 'FY 2025-26'` and the same eight `vendor_name` values, then re-inserts them. Implementation: `backend/scripts/seed_vendor_licenses_fy2026.py`.

---

## 3. API

**Base path:** `/vendor-licenses`  
**Router:** `backend/routers/resume_supplier_licenses.py`  
**Auth:** Requires a logged-in user (`get_current_user`). **No** project-based scoping—any authenticated role that can open the route may read/write (aligns with nav for admin / executive / manager).

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/vendor-licenses` | List all rows (ordered by `sort_order`, `id`). |
| `GET` | `/vendor-licenses/{id}` | Single row. |
| `POST` | `/vendor-licenses` | Create (`vendor_name` required). |
| `PATCH` | `/vendor-licenses/{id}` | Partial update; nullable fields can be cleared with `null`. |
| `DELETE` | `/vendor-licenses/{id}` | Remove row. |

**Activity log:** Create/update/delete also append rows to `activity_log` with `resource_type` = `resume_supplier_license`.

**Dates:** Use ISO `YYYY-MM-DD` strings in JSON bodies.

---

## 4. Frontend

- **Route:** `/vendor-licenses`
- **Page:** `frontend/src/pages/VendorLicenses.tsx`
- **Nav:** Analytics → **Vendor licenses** (see `frontend/src/App.tsx`, `auth.tsx`, `persona.tsx`).
- **Client types / API helpers:** `ResumeSupplierLicenseRow`, `queries.vendorLicensesList`, `createVendorLicense`, `patchVendorLicense`, `deleteVendorLicense` in `frontend/src/lib/api.ts`.

**Behaviour:**

- Table with search (vendor, FY label, remarks, id).
- KPIs: row count, **sum of `cost_inr`**, count of distinct `fiscal_year_label`.
- **Add vendor row** / **Edit** opens a dialog with all fields; **Delete** confirms then calls API.
- **Cost** is entered as a plain number; display uses existing `formatCurrency` (INR).

---

## 5. Mapping from the Excel tracker (reference)

| Spreadsheet column | Field(s) in DB |
| ------------------ | -------------- |
| # | Use `id` + optional `sort_order` for display order. |
| Job Board / Vendor | `vendor_name` |
| Login IDs | `login_ids_count` |
| Resume Inventory | `resume_inventory` |
| Job Postings | `job_postings` |
| Naukri Invites | `naukri_invites` |
| Utilization | `utilization` |
| Start / End Date | `start_date`, `end_date` |
| Contract Duration (Months) | `contract_duration_months` |
| Cost (INR ₹) | `cost_inr` (strip symbols/commas on entry) |
| Primary / Secondary person (3 × 2) | `primary_person_*`, `secondary_person_*` |
| Remarks | `remarks` |
| FY header (e.g. FY 2025-26) | `fiscal_year_label` on each row |
| TOTAL / SUMMARY row | **Omit** — use UI total or `SUM(cost_inr)` |

---

## 6. Related files

| Area | Path |
| ---- | ---- |
| Model | `backend/db/database.py` — `ResumeSupplierLicense` |
| API | `backend/routers/resume_supplier_licenses.py` |
| App registration | `backend/main.py` — `resume_supplier_licenses_router` |
| UI | `frontend/src/pages/VendorLicenses.tsx` |
| Types & client | `frontend/src/lib/api.ts` |

---

*Last updated: vendor license table, `/vendor-licenses` API, and Vendor licenses UI.*
