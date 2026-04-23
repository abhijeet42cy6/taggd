-- Wipe application data; keep users with role platform_admin or admin (legacy).
-- Run only after verifying at least one such user exists:
--   SELECT id, email, role FROM users WHERE LOWER(TRIM(role)) IN ('platform_admin', 'admin');
--
-- Example (from repo root, default SQLite path):
--   sqlite3 revenue_generator.db < backend/scripts/clear_data_keep_admin.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

DELETE FROM "activity_log";
DELETE FROM "candidate_master_links";
DELETE FROM "candidates";
DELETE FROM "candidate_masters";
DELETE FROM "finance_bank_statement_lines";
DELETE FROM "finance_billing_validation_events";
DELETE FROM "finance_payment_receipts";
DELETE FROM "finance_tds_certificates";
DELETE FROM "finance_billing_workflow";
DELETE FROM "taggd_revenue_billing";
DELETE FROM "revenue_forecast_weekly";
DELETE FROM "revenue_visibility_snapshot";
DELETE FROM "revenue_weekly_submission";
DELETE FROM "finance_efficiency_kpis";
DELETE FROM "finance_cash_flow";
DELETE FROM "finance_monthly_ledger";
DELETE FROM "wfm_resource_gaps";
DELETE FROM "wfm_hr_benchmarks";
DELETE FROM "sla_performances";
DELETE FROM "metric_definitions";
DELETE FROM "meeting_action_items";
DELETE FROM "platform_meetings";
DELETE FROM "task_assignees";
DELETE FROM "platform_tasks";
DELETE FROM "resume_supplier_licenses";
DELETE FROM "ingestion_events";
DELETE FROM "project_transitions";
DELETE FROM "project_contracts";
DELETE FROM "records";
DELETE FROM "user_project_assignments";
DELETE FROM "projects";
DELETE FROM "clients";

DELETE FROM "users" WHERE LOWER(TRIM("role")) NOT IN ('platform_admin', 'admin');
UPDATE "users" SET "manager_user_id" = NULL;

-- Reset autoincrement bookkeeping where present (ignores errors if no row for table)
DELETE FROM sqlite_sequence WHERE "name" = 'activity_log';
DELETE FROM sqlite_sequence WHERE "name" = 'candidate_master_links';
DELETE FROM sqlite_sequence WHERE "name" = 'candidates';
DELETE FROM sqlite_sequence WHERE "name" = 'candidate_masters';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_bank_statement_lines';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_billing_validation_events';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_payment_receipts';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_tds_certificates';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_billing_workflow';
DELETE FROM sqlite_sequence WHERE "name" = 'taggd_revenue_billing';
DELETE FROM sqlite_sequence WHERE "name" = 'revenue_forecast_weekly';
DELETE FROM sqlite_sequence WHERE "name" = 'revenue_visibility_snapshot';
DELETE FROM sqlite_sequence WHERE "name" = 'revenue_weekly_submission';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_efficiency_kpis';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_cash_flow';
DELETE FROM sqlite_sequence WHERE "name" = 'finance_monthly_ledger';
DELETE FROM sqlite_sequence WHERE "name" = 'wfm_resource_gaps';
DELETE FROM sqlite_sequence WHERE "name" = 'wfm_hr_benchmarks';
DELETE FROM sqlite_sequence WHERE "name" = 'sla_performances';
DELETE FROM sqlite_sequence WHERE "name" = 'metric_definitions';
DELETE FROM sqlite_sequence WHERE "name" = 'meeting_action_items';
DELETE FROM sqlite_sequence WHERE "name" = 'platform_meetings';
DELETE FROM sqlite_sequence WHERE "name" = 'task_assignees';
DELETE FROM sqlite_sequence WHERE "name" = 'platform_tasks';
DELETE FROM sqlite_sequence WHERE "name" = 'resume_supplier_licenses';
DELETE FROM sqlite_sequence WHERE "name" = 'ingestion_events';
DELETE FROM sqlite_sequence WHERE "name" = 'project_transitions';
DELETE FROM sqlite_sequence WHERE "name" = 'project_contracts';
DELETE FROM sqlite_sequence WHERE "name" = 'records';
DELETE FROM sqlite_sequence WHERE "name" = 'user_project_assignments';
DELETE FROM sqlite_sequence WHERE "name" = 'projects';
DELETE FROM sqlite_sequence WHERE "name" = 'clients';
DELETE FROM sqlite_sequence WHERE "name" = 'users';

COMMIT;

PRAGMA foreign_keys = ON;
