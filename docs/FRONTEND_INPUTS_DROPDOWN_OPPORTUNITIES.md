# Frontend inputs: inventory and dropdown opportunities

This report scans **`frontend/src`** for user-editable fields (`<input>`, `<textarea>`, `<select>`, shadcn `Input`/`Textarea`, and combobox-style `platform-search` inputs). It classifies each area **tab/section by page or drawer**, notes what is **already backed by DB-connected pickers**, and lists **free-text fields that could become dropdowns (or searchable selects)** populated from **existing API / table data**.

**Method:** ripgrep across `*.tsx` for `platform-search`, `Input`, `Textarea`, `<select`, plus targeted reads of large forms (`Meetings`, `Tasks`, `RequisitionCreateDrawer`, `SlaMetricFormDialog`, `FinanceLedgerFormDialog`, `searchable-pickers.tsx`, etc.).

---

## Summary table

| Area | Already DB-connected? | Top dropdown opportunities |
| ---- | ---------------------- | --------------------------- |
| Finance ledger dialog | Yes — `SearchableProjectPicker`, account/month from ledger VM | — |
| SLA metric dialog | Yes — project + metric pickers; RAG is `<select>` | `metric_group`, `metric_nature`, `source_system` → DISTINCT from `metric_definitions` |
| WFM benchmark dialog | Pattern similar to finance (project picker) | Benchmark dimension fields if repeated in `wfm_hr_benchmarks` |
| Requisition create drawer | Project = `<select>` from props | `department`, `location`, `hiring_manager`, pipeline `status` → DISTINCT from `records` for project (or org) |
| Meetings dialog | Project = `<select>`; meeting status = fixed `<select>` | `meeting_type`, `meeting_mode`, `mom_status` → enums + optional “Other”; `organizer_name` → `users`; `account_snapshot` → default from selected `project`; action **Owner** → users; **Status** → small enum |
| Tasks board + dialog | Filters: status + project `<select>`; assignees = checkboxes from API | `linked_resource_type` → fixed list + **linked id** → type-specific search (record id, meeting id, …); `priority` → enum |
| Vendor licenses | All free-text / numeric | `fiscal_year_label` → DISTINCT from `taggd_revenue_billing.fiscal_year_label` or `records.fy_label` |
| Billing / finance validation | Mixed | Payment mode / GST / validation status where free-text duplicates DB enums — align with `finance_billing_workflow` columns |
| Candidate drawer | Mostly free-text (HR domain) | `current_stage`, `source_of_hire` / `sub_source`, `global_status` → DISTINCT or `users` for recruiter/HM if APIs added |
| Client contracts | Text + textarea | `contract_status`, `pricing_model`, `account_type` → DISTINCT from `project_contracts` |
| Transitions | Some `<option>` | Remaining free fields → milestones are dates OK; status extended list from DB if standardized |
| Record table (legacy) | Shadcn `Select` for status/location from row-derived options | — |
| Admin users | Email/password text; role `<select>`; vertical checkboxes | — |
| Login / profile | Credentials / PII — keep text | — |
| Ingestion / file uploads | Files, not semantic DB pickers | Sheet pickers already UI-specific |
| Agent / AgentChat | Prompt text — keep | — |
| App shell search | Non-functional placeholder | Remove or wire to global search API |

---

## 1. Shared components (reused patterns)

### 1.1 `components/platform/searchable-pickers.tsx`

| Component | UX | DB connection |
| ----------- | --- | --------------- |
| `SearchableProjectPicker` | Typeahead + click list | **`projects`** list loaded in parent (`queries.projects()`) |
| `SearchableStringPicker` | Same pattern for strings | Options passed in (e.g. **account names** from ledger rows) |
| `SearchableMetricOptionPicker` | KPI choice | Built from **`metricOptions`** (SLA metrics already in DB) |

**Verdict:** These are the **reference implementation** for “connected” dropdowns. New fields should follow this pattern when the option set is **> ~15** or needs search.

### 1.2 `components/platform/FinanceLedgerFormDialog.tsx`

- **Project:** `SearchableProjectPicker` + `queries.projects()`.
- **Account / month (edit mode):** `SearchableStringPicker` over **`accountsInLedger`** / **`monthsForEditAccount`** derived from `ledgerRows` (already DB-backed VM).

**Verdict:** Well aligned with stored data.

### 1.3 `components/platform/SlaMetricFormDialog.tsx`

| Field | Control | Dropdown? |
| ----- | ------- | --------- |
| Client / project | `SearchableProjectPicker` | Done |
| Existing KPI (edit) | `SearchableMetricOptionPicker` | Done |
| Metric label | Free text | Keep (defines new KPI name) |
| Metric group / nature / source | Free text | **Yes** — suggest `SELECT DISTINCT metric_group` / `metric_nature` / `source_system` from org’s `metric_definitions` (new small API or embed in `sla/data`) |
| Definition / formula / calculation | Textarea | Keep (long text) |
| Reporting month | `input type="month"` | OK |
| Score | Free text | Keep or numeric input |
| RAG | `<select>` fixed set | Done (could normalize casing to single enum in DB) |

### 1.4 `components/platform/WfmBenchmarkFormDialog.tsx`

Uses `SearchableProjectPicker` and text/numeric fields for benchmark row. **Opportunity:** if WL levels or sheet labels repeat, expose DISTINCT dimensions from `wfm_hr_benchmarks` (requires API).

### 1.5 `components/platform/RequisitionCreateDrawer.tsx`

| Field | Control | Dropdown opportunity |
| ----- | ------- | -------------------- |
| Project | `<select>` from `projects` prop | Done |
| Req ID | Text | Keep |
| Candidate / position | Text | Keep (identity) |
| Hiring manager | Text | **Yes** — `DISTINCT hiring_manager` on `records` for `project_id`, or **`users`** if you store `hiring_manager_user_id` consistently |
| Department / location | Text | **Yes** — `DISTINCT department` / `location` on `records` for project or client |
| Pipeline status (`status`) | Text | **Yes** — `DISTINCT status` on `records` for project |
| Global status | `<select>` fixed enum | Done |
| Dates | `type="date"` | OK |
| Additional JSON | Textarea | Keep |

**API gap:** today there is no dedicated **`GET /records/distinct-fields?project_id=`**; you would add one or derive client-side from `recordsAll` already loaded on `ClientDetail` / `Requisitions`.

### 1.6 `components/platform/RequisitionRecordDrawer.tsx`

Contains textareas/inputs for editing a row (partial read). Same opportunities as drawer for **department, location, hiring_manager, status** if shown as text.

### 1.7 `components/platform/CandidateFormDrawer.tsx`

Large HR form: many `platform-search` inputs (name, email, stages, CTC, dates, etc.).

| Category | Dropdown opportunity | Suggested source |
| -------- | -------------------- | ---------------- |
| `current_stage` | Yes | DISTINCT `candidates.current_stage` or small org enum |
| `source_of_hire`, `sub_source` | Yes | DISTINCT from `candidates` / `records.rpo_source_of_hire` |
| `assigned_recruiter`, `hiring_manager` (string fields) | Yes | `users` list (scoped) or DISTINCT strings |
| `global_status` | Possibly | Align with requisition statuses or fixed enum |
| Narrative / medical / BG | Text | Keep |

**API gap:** `queries.taskAssignableUsers` pattern could be mirrored as **`queries.usersForProject`** for HM/recruiter pickers.

---

## 2. Pages (route-by-route)

### 2.1 `/` — `Dashboard.tsx` + `StatsDashboard` / `DashboardFilters`

- Mostly **charts + KPIs** from `queries.*`; filters may use **`DashboardFilters`** / `global-filters`.
- **Productivity averages** (`ProductivityAveragesSection`): finance rows are scoped to the **FY selector** (`kpiRows`), consistent with **Financial performance** — see **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §8.
- **Action:** audit `DashboardFilters.tsx` and **`lib/global-filters.tsx`** for any raw text filters → replace with selects fed by **`queries.projects()`** or DISTINCTs from stats endpoints.

### 2.2 `/clients` — `ClientsHub.tsx`

- **Search:** `platform-search` — filter client list.
- **Opportunity:** if client list grows, use **combobox** over `queries.clients()` (already loaded).

### 2.3 `/clients/:id` — `ClientDetail.tsx`

- **Logic / filename** area: `<input>` for editing project metadata (grep line ~318).
- **Requisition filters:** native `<select>` for **status, department, location, ageing** + date inputs — **already driven from derived option sets** on loaded records (good pattern).
- **Opportunity:** any remaining free-text project fields that mirror **`projects`** columns could use pickers (e.g. `vertical` from DISTINCT org values).

### 2.4 `/client-contracts` — `ClientContracts.tsx`

- Mix of **textareas** and **inputs** for contract fields.
- **Dropdown opportunities:** `contract_status`, `renewal_status`, `pricing_model`, `account_type` → `SELECT DISTINCT ... FROM project_contracts` (or static enum matching ingest).

### 2.5 `/meetings` — `Meetings.tsx` (dialog)

| Field | Current | Connected dropdown? |
| ----- | ------- | --------------------- |
| Meeting title | Text | Keep |
| Meeting type | Text | **Yes** — DISTINCT `meeting_type` from `platform_meetings` or small enum |
| Organizer name | Text | **Yes** — `users` on project / org (`organizer_user_id` exists on model but UI uses name string) |
| Times | Text placeholders | Optional `type="time"` |
| Project | `<select>` | Done |
| Account snapshot | Text | **Yes** — auto-fill from `project.account_name` when project chosen; allow override |
| Meeting mode | Text | **Yes** — enum (Video / In person / Hybrid) |
| Meeting status | `<select>` | Done |
| MoM status | Text | **Yes** — enum aligned with `mom_status` usage |
| Attendees internal | Textarea | **Optional** — multi-select users (needs roster API) |
| Action owner / status | Text | **Owner** → users; **status** → enum |

### 2.6 `/requisitions` — `Requisitions.tsx`

- Search `platform-search`.
- **RecordTable** / drawer handle row UX; **distinct filters** already elsewhere.

### 2.7 `/candidates` — `Candidates.tsx`

- List filters: text search inputs.
- **Opportunity:** stage/source filters as selects if you add DISTINCT query or reuse candidate list facets.

### 2.8 `/candidate-store` — `CandidateStore.tsx`

- Search input — appropriate.

### 2.9 `/finance` — `FiscalPerformance.tsx` + `FinanceExecDashboard.tsx`

- Grep shows **no raw `platform-search`** in `FiscalPerformance.tsx` (likely child components + file upload).
- **Finance ledger dialog** carries editable semantics — see §1.2.

### 2.10 `/revenue-trackers` — `RevenueTrackers.tsx`

- **`<select>`** for project filter and as-of filter (good).
- **Governance week** (Monday) drives the **Indian FY** used for the **Revenue forecast** tab’s **AMJ (Apr–Jun)** quarter totals and the three-month **forecast vs MMF** chart.
- **Remarks** textarea — keep.

### 2.11 `/billing` — `Billing.tsx`

- Inputs for **numeric** and some text (invoice fields).
- **Opportunity:** `project_manager` string → pick from **`users`** or `projects` metadata; **FY label** from DISTINCT billing rows.

### 2.12 `/finance-validation` — `FinanceValidation.tsx`

- Many **`platform-search`** fields for payment refs, amounts, notes.
- **Opportunity:** `payment_mode`, `gst_reconciliation_status`, `validation_status` → strict enums matching **`finance_billing_workflow`** column vocabulary (reduce typos, help reporting).

### 2.13 `/revenue-governance` — `RevenueGovernance.tsx`

- Textarea for review notes — keep.
- Queue actions — not free-text entry for core IDs.

### 2.14 `/vendor-licenses` — `VendorLicenses.tsx`

- Many **text/number/date** fields; vendor name free text is appropriate.
- **`fiscal_year_label`** — strong candidate for **`<select>`** from existing **`resume_supplier_licenses.fiscal_year_label`** + **`taggd_revenue_billing.fiscal_year_label`**.

### 2.15 `/sla-performance` — `SLAPerformance.tsx`

- Search + chart pickers (custom UI, not all `platform-search`).
- Upload is file-based.

### 2.16 `/wfm` — `WorkforceManagement.tsx`

- Productivity chart uses **`platform-search`** as search for account names in chart (grep) — could be **combobox** over WFM data keys.

### 2.17 `/data-operations` — `DataOperations.tsx`

- No `platform-search` grep hits — likely buttons + tables; re-verify after UI changes.

### 2.18 `/ingestion` — `IngestionCenter.tsx`

- **File inputs** + sheet toggles — not DB enum pickers.

### 2.19 `/tasks` — `Tasks.tsx`

See §1.6 and **Tasks dialog** in readout:

- **`linked_resource_type` / `linked_resource_id`** — highest-value improvement: **type** = `<select>` (`requisition`, `meeting`, `contract`, `billing`, …) and **id** = dependent **`Searchable*Picker`** hitting scoped list endpoints (`/records`, `/meetings`, …).
- **`priority`** — `<select>` with `p0 | p1 | p2 | normal`.
- **`subtype`** — optional enum if backend documents allowed verbs.

### 2.20 `/transitions` — `Transitions.tsx`

- Mix of `<select>` and textareas for delay reasons etc.
- **Status** — ensure options match **`project_transitions.status`** allowed values; extend from DB DISTINCT if needed.

### 2.21 `/activity` — `ActivityLog.tsx`

- Filters read-only consumption — check for text filters.

### 2.22 `/agent` — `Agent.tsx` / `AgentChat.tsx`

- **Free text is the product** — do not convert to DB dropdowns except maybe **“saved prompt”** snippets (future).

### 2.23 `/admin/users` — `AdminUsers.tsx`

- Email, password (create) — text OK.
- **Role** — `<select>` done.
- **Vertical access** — structured checkboxes done.
- **Project assignment** — uses project list — verify multiselect UX.

### 2.24 `/profile` — `Profile.tsx`

- Name/phone — PII text — keep.

### 2.25 `/login` — `Login.tsx`

- Email/password — keep.

### 2.26 `App.tsx` shell

- **Topbar search** — `<input placeholder="Search…">` **not wired** to any query; either implement global search API or remove to avoid false affordance.

### 2.27 `RecordTable.tsx` (legacy / alternate surface)

- **Shadcn `Select`** for **status** and **location** filters with options from **records** — good reference.

### 2.28 `BudgetForecast.tsx` (not in `App.tsx` routes on current branch)

- Numeric `Input` for quarter edits — appropriate; client linkage is elsewhere.

### 2.29 `Projects.tsx` / `ProjectDetail.tsx` / `Upload.tsx`

- Older or alternate flows — spot-check if still linked from any nav.

---

## 3. Implementation priorities (recommended order)

1. **Tasks: linked resource type + id** — reduces bad links; uses existing REST lists with project scope.
2. **Meetings: meeting type, mode, MoM status + organizer user** — improves consistency; may need small API to list users for project/org.
3. **Requisition create: department, location, hiring manager, pipeline status** — high volume data entry; DISTINCT endpoint cheap.
4. **SLA metric dialog: metric_group / nature / source_system** — DISTINCT from `metric_definitions`.
5. **Vendor FY label** — DISTINCT from finance/billing tables.
6. **Finance validation: enumerated financial fields** — match workflow state machine strings.
7. **Client contracts: status / pricing model** — DISTINCT or enum.

---

## 4. Mermaid — target state for “connected pickers”

```mermaid
flowchart LR
  subgraph ui["Frontend form"]
    D1[Distinct picker API]
    P1[SearchableProjectPicker]
    U1[User roster API]
    E1[Fixed enum select]
  end
  subgraph api["FastAPI"]
    R1[/records/distinct]
    M1[/sla/distinct-metric-meta]
    T1[/tasks/link-targets]
    PR[/projects]
    US[/admin/users or /tasks/assignable]
  end
  subgraph db["SQLite"]
    REC[(records)]
    MET[(metric_definitions)]
    PRJ[(projects)]
    U[(users)]
  end
  D1 --> R1 --> REC
  D1 --> M1 --> MET
  P1 --> PR --> PRJ
  U1 --> US --> U
  E1 --> E1
```

---

## 5. Files touched by this audit (non-exhaustive list)

- `frontend/src/pages/Meetings.tsx`
- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/VendorLicenses.tsx`
- `frontend/src/pages/Billing.tsx`
- `frontend/src/pages/FinanceValidation.tsx`
- `frontend/src/pages/ClientContracts.tsx`
- `frontend/src/components/platform/RequisitionCreateDrawer.tsx`
- `frontend/src/components/platform/CandidateFormDrawer.tsx`
- `frontend/src/components/platform/SlaMetricFormDialog.tsx`
- `frontend/src/components/platform/FinanceLedgerFormDialog.tsx`
- `frontend/src/components/platform/searchable-pickers.tsx`
- `frontend/src/components/RecordTable.tsx`
- `frontend/src/App.tsx`

---

## 6. What to keep as free text

- Long **narrative** (meeting discussion, decisions, billing discrepancy notes, agent prompts).
- **JSON** editors (`additional_json`, `attachments_json`, `external_attendees_json` when structured JSON is intended).
- **Person names** that are not in `users` (external candidates).
- **Numeric amounts** and **dates** (use appropriate `input type` rather than `<select>`).

---

*Generated from static codebase analysis; re-run grep after large UI refactors.*
