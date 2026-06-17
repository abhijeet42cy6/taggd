#!/usr/bin/env bash
# Table-wise export from dev Cloud SQL clone (read-only). One .sql + .csv per table.
# Usage: ./scripts/export-dev-cloudsql-by-table.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh"

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
PROXY_PORT="${CLOUDSQL_PROXY_PORT_EXPORT:-9474}"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="${REPO_ROOT}/dumps/tgddata_dev-by-table-${STAMP}"
PROXY_BIN="${CLOUDSQL_PROXY_BIN:-cloud-sql-proxy}"
command -v "$PROXY_BIN" >/dev/null 2>&1 || PROXY_BIN="/opt/homebrew/bin/cloud-sql-proxy"

gcloud config set project "$GCP_PROJECT" --quiet
gcloud config set account "${GCLOUD_ACCOUNT:-shubham@aocr.in}" --quiet 2>/dev/null || true

TOKEN="$(gcloud auth print-access-token --project="$GCP_PROJECT")"
PASS="$(gcloud secrets versions access latest --secret="${CLOUDSQL_SECRET_PASSWORD_DEV}" --project="$GCP_PROJECT")"

mkdir -p "$OUT_DIR"/{sql,csv}

"$PROXY_BIN" "$CLOUDSQL_CONNECTION_NAME_DEV" --port "$PROXY_PORT" --token "$TOKEN" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
sleep 4

PG() {
  docker run --rm --network host -e PGPASSWORD="$PASS" postgres:16-alpine \
    psql -h host.docker.internal -p "$PROXY_PORT" -U "$CLOUDSQL_USER_DEV" -d "$CLOUDSQL_DATABASE_DEV" "$@"
}

TABLES="$(PG -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")"

{
  echo "# tgddata_dev table-wise export"
  echo "# Generated: $(date -Iseconds)"
  echo "# Instance: ${CLOUDSQL_INSTANCE_DEV}"
  echo "# Database: ${CLOUDSQL_DATABASE_DEV}"
  echo ""
  echo "| table | rows | sql | csv |"
  echo "|-------|------|-----|-----|"
} >"${OUT_DIR}/INDEX.md"

for T in $TABLES; do
  ROWS="$(PG -t -A -c "SELECT COUNT(*) FROM \"${T}\";")"
  echo "==> ${T} (${ROWS} rows)"

  docker run --rm --network host -e PGPASSWORD="$PASS" -v "${OUT_DIR}/sql:/out" postgres:16-alpine \
    pg_dump -h host.docker.internal -p "$PROXY_PORT" -U "$CLOUDSQL_USER_DEV" -d "$CLOUDSQL_DATABASE_DEV" \
      --table="public.${T}" \
      --column-inserts \
      --no-owner --no-acl \
      -f "/out/${T}.sql"

  PG -c "\\copy (SELECT * FROM \"${T}\") TO STDOUT WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')" \
    >"${OUT_DIR}/csv/${T}.csv"

  echo "| ${T} | ${ROWS} | sql/${T}.sql | csv/${T}.csv |" >>"${OUT_DIR}/INDEX.md"
done

echo ""
echo "Done: ${OUT_DIR}"
echo "  sql/  — one file per table (CREATE + INSERT with column names)"
echo "  csv/  — one file per table (headers + all rows)"
echo "  INDEX.md — table list and row counts"
