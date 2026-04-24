#!/usr/bin/env bash
# Full CLI ingestion on the GCP VM (or anywhere Docker Compose runs tgddata_C1).
#
# Prerequisites:
#   - Backend container up: tgddata_c1-backend-1 (Compose v2) or tgddata_c1_backend_1 (older)
#   - Repo layout at ~/tgddata_C1 with excel_files_imp/ populated (bundled with deploy since deploy includes that folder)
#   - Matches docs/DATA_INGESTION_RUNBOOK.md ordering for directory → SLA → revenue → finance → WFM → contracts.
#
# Resume Supply Chain Partner_Tracker.xlsx has no standalone script — use Ingestion Center in the app (POST /upload).
#
# Usage (on VM):
#   cd ~/tgddata_C1 && chmod +x scripts/vm-ingest-all.sh && ./scripts/vm-ingest-all.sh
#
set -euo pipefail

CONTAINER="${CONTAINER:-tgddata_c1-backend-1}"
ROOT="/app"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: Container $CONTAINER is not running. From ~/tgddata_C1 run: docker-compose up -d" >&2
  exit 1
fi

run_py() {
  docker exec -w "$ROOT" "$CONTAINER" python3 "$@"
}

echo "==> 1/8 Account mapping sync + report"
run_py backend/scripts/run_account_mapping_sync.py

echo "==> 2/8 Reconcile mapping clients (dry-run)"
run_py backend/scripts/reconcile_mapping_clients.py --dry-run

echo "==> 3/8 Reconcile mapping clients (apply)"
run_py backend/scripts/reconcile_mapping_clients.py

echo "==> 4/8 SLA basefile"
run_py backend/scripts/ingest_sla.py "excel_files_imp/Raw Data SLA Basefile.xlsx"

echo "==> 5/8 Revenue trackers (dry-run)"
run_py backend/scripts/ingest_revenue_trackers.py --dry-run

echo "==> 6/8 Revenue trackers (apply)"
run_py backend/scripts/ingest_revenue_trackers.py

echo "==> 7/8 Finance masters (FY24–25 then FY25–26 — newest copies in excel_files_imp)"
run_py -c "from backend.scripts.ingest_finance import ingest_finance_master; ingest_finance_master('excel_files_imp/FY24-25_Finance Data (2).xlsx')"
run_py -c "from backend.scripts.ingest_finance import ingest_finance_master; ingest_finance_master('excel_files_imp/FY25-26_Finance Data (2).xlsx')"

echo "==> 8/8 WFM + contracts"
run_py -c "from backend.scripts.ingest_wfm import ingest_wfm_master; ingest_wfm_master('excel_files_imp/WFM (Projected Headcount & Revenue).xlsx')"
run_py backend/scripts/ingest_project_contracts.py "excel_files_imp/Project Signup Renewal Detail New.xlsx"

echo ""
echo "==> Done."
echo "Not ingested via CLI: excel_files_imp/Resume Supply Chain Partner_Tracker.xlsx → use Ingestion Center."
