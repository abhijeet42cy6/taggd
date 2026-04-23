# Excel upload masters

Blank **.xlsx** workbooks whose **first row is the exact ORM/DB field name** for each table (from `backend/db/database.py`, reflected via the SQLAlchemy `Table` column order). Row 2 has short **hints** (dates, JSON, `password_hash`).

## Dropdowns (data validation)

Where the system uses **closed lists** (roles, workflow states, joiner source types, finance metric categories, task status/priority, etc.), the generator adds **Excel data validation** on data rows (rows 3–5002) pointing at a hidden `**lists`** sheet. Identical option sets are **deduplicated** to one column on `lists`.

- **Booleans** in the ORM (SQLAlchemy `Boolean`) get choices `**1` / `0`** unless a column has an explicit list in `excel_upload_masters/column_dropdowns.py` (e.g. contract flags with the same values).
- **IDs** (`project_id`, `user_id`, …) and **free-text** fields have **no** dropdown; ingesters or users fill those as usual.
- **Sources of truth** for the lists: `column_dropdowns.py` imports or mirrors `backend` constants (`auth.profile` roles, `finance_billing_workflow_core` statuses, `revenue_weekly_submission_core`, `finance_planning_categories`, `candidate_master_mgmt` link sources, `RECORD_SOURCE_JOINER_TYPES`, and UI enums such as requisition `global_status` and transition board statuses). Extend that file when you add new enum values in code.

## Regenerate

From the repository root, with the project on `PYTHONPATH`:

```bash
PYTHONPATH=. python3 excel_upload_masters/generate_templates.py
```

Output directory: `excel_upload_masters/templates/`. A `templates/_generated_at.txt` stamp is written on each run.

## Recommended load order (foreign keys)

1. **Clients, then projects** — `01_spine_clients_projects.xlsx` (`clients` before `projects`; `projects.client_id` → `clients.id`).
2. **Users and project access** — `02_users_rbac.xlsx` — create `users` first; `user_project_assignments` need `user_id` and `project_id`.
3. **Commercial / onboarding** — `03_commercial_contracts.xlsx` (`project_contracts.project_id`), `04_client_onboarding_transitions.xlsx` (`project_transitions` links to `projects`).
4. **Pipeline** — `05_pipeline_requisitions_records.xlsx` — `records` require `project_id` (→ `projects`); `hiring_manager_user_id` / `assigned_recruiter_user_id` (→ `users`) when set.
5. **Candidates** — `06_candidates.xlsx` (needs `project_id` and `record_id`); `07_candidate_identity_masters.xlsx` (create `candidate_masters` first, then `candidate_master_links` → `candidates` + `candidate_masters`).
6. **SLA & WFM** — `08_sla.xlsx`, `09_workforce_management.xlsx` (link fields reference clients/projects/records as defined on each model).
7. **Finance & revenue** — `10_finance_core.xlsx` through `12_billing_taggd_workflow.xlsx` (ledger/cash/efficiency, then revenue weekly/forecast/visibility, then TagGD billing, billing workflow, payments, TDS, bank lines — align `project_id` / billing IDs per FK columns on each table).
8. **Collaboration** — `13_meetings.xlsx`, `14_tasks.xlsx` (meetings and tasks → assignees; both reference users/projects as per column names).
9. **Vendors** — `15_vendor_resume_licenses.xlsx`.
10. **Ingestion metadata (optional)** — `16_ingestion_audit.xlsx` (`ingestion_events`) if you are replaying or documenting imports.

`activity_log` is **not** included: it is intended for **append-only platform audit** from the app, not bulk spreadsheet upload.

## Workbook index


| File                                    | Sheets (tables)                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_spine_clients_projects.xlsx`        | `clients`, `projects`                                                                                                                                                            |
| `02_users_rbac.xlsx`                    | `users`, `user_project_assignments`                                                                                                                                              |
| `03_commercial_contracts.xlsx`          | `project_contracts`                                                                                                                                                              |
| `04_client_onboarding_transitions.xlsx` | `project_transitions`                                                                                                                                                            |
| `05_pipeline_requisitions_records.xlsx` | `records`                                                                                                                                                                        |
| `06_candidates.xlsx`                    | `candidates`                                                                                                                                                                     |
| `07_candidate_identity_masters.xlsx`    | `candidate_masters`, `candidate_master_links`                                                                                                                                    |
| `08_sla.xlsx`                           | `metric_definitions`, `sla_performances`                                                                                                                                         |
| `09_workforce_management.xlsx`          | `wfm_hr_benchmarks`, `wfm_resource_gaps`                                                                                                                                         |
| `10_finance_core.xlsx`                  | `finance_monthly_ledger`, `finance_cash_flow`, `finance_efficiency_kpis`                                                                                                         |
| `11_revenue_trackers.xlsx`              | `revenue_weekly_submission`, `revenue_forecast_weekly`, `revenue_visibility_snapshot`                                                                                            |
| `12_billing_taggd_workflow.xlsx`        | `taggd_revenue_billing`, `finance_billing_workflow`, `finance_billing_validation_events`, `finance_payment_receipts`, `finance_tds_certificates`, `finance_bank_statement_lines` |
| `13_meetings.xlsx`                      | `platform_meetings` (`meetings` table), `meeting_action_items`                                                                                                                   |
| `14_tasks.xlsx`                         | `platform_tasks` (`tasks` table), `task_assignees`                                                                                                                               |
| `15_vendor_resume_licenses.xlsx`        | `resume_supplier_licenses`                                                                                                                                                       |
| `16_ingestion_audit.xlsx`               | `ingestion_events`                                                                                                                                                               |


For relationship detail and business naming, see `DATABASE_SCHEMA.md` at the repository root. If the code model and that doc ever diverge, **trust `database.py` and regenerate these templates**.