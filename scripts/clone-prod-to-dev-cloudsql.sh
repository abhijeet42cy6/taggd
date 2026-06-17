#!/usr/bin/env bash
# Refresh dev clone: READ-ONLY pg_dump from prod → pg_restore into tgddata_dev.
# Production servers, Cloud Run, GCS, and prod row data are NOT modified.
#
# Requires: gcloud auth, cloud-sql-proxy, Docker (postgres:16-alpine).
# Prod instance may briefly need public IP for laptop dump; script removes it on exit.
#
# Usage (from repo root):
#   ./scripts/clone-prod-to-dev-cloudsql.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod.sh"

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
PROD_INSTANCE="${CLOUDSQL_INSTANCE:-tgddata-pg-prod}"
DEV_INSTANCE="${CLOUDSQL_INSTANCE_DEV:-tgddata-pg-prod-dev}"
PROD_CONN="${CLOUDSQL_CONNECTION_NAME}"
DEV_CONN="${CLOUDSQL_CONNECTION_NAME_DEV}"
PROD_DB="${CLOUDSQL_DATABASE:-tgddata}"
DEV_DB="${CLOUDSQL_DATABASE_DEV:-tgddata_dev}"
PROD_USER="${CLOUDSQL_USER:-tgddata_app}"
DEV_USER="${CLOUDSQL_USER_DEV:-tgddata_app}"
PROD_SECRET="${CLOUDSQL_SECRET_PASSWORD:-tgddata-pg-prod-db-password}"
DEV_SECRET="${CLOUDSQL_SECRET_PASSWORD_DEV:-tgddata-pg-prod-dev-db-password}"
PROXY_PROD_PORT="${CLOUDSQL_PROXY_PORT_PROD:-9470}"
PROXY_DEV_PORT="${CLOUDSQL_PROXY_PORT_DEV:-9472}"
DUMP_FILE="${DUMP_FILE:-/tmp/tgddata-prod-clone.dump}"

PROXY_BIN="${CLOUDSQL_PROXY_BIN:-cloud-sql-proxy}"
command -v "$PROXY_BIN" >/dev/null 2>&1 || PROXY_BIN="/opt/homebrew/bin/cloud-sql-proxy"
command -v "$PROXY_BIN" >/dev/null 2>&1 || { echo "ERROR: cloud-sql-proxy not found" >&2; exit 1; }

gcloud config set project "$GCP_PROJECT" --quiet
gcloud config set account "${GCLOUD_ACCOUNT:-shubham@aocr.in}" --quiet 2>/dev/null || true

ASSIGNED_PUBLIC_IP=0
cleanup() {
  kill "${PROXY_PROD_PID:-}" "${PROXY_DEV_PID:-}" 2>/dev/null || true
  if [ "$ASSIGNED_PUBLIC_IP" = "1" ]; then
    echo "==> Restoring prod private-IP-only (removing temporary public IP)"
    gcloud sql instances patch "$PROD_INSTANCE" --no-assign-ip --project="$GCP_PROJECT" --quiet || true
  fi
}
trap cleanup EXIT

if [ "$(gcloud sql instances describe "$PROD_INSTANCE" --project="$GCP_PROJECT" --format='value(settings.ipConfiguration.ipv4Enabled)')" != "True" ]; then
  echo "==> Temporarily enabling public IP on $PROD_INSTANCE (read-only dump; reverted on exit)"
  gcloud sql instances patch "$PROD_INSTANCE" --assign-ip --project="$GCP_PROJECT" --quiet
  ASSIGNED_PUBLIC_IP=1
  sleep 90
fi

TOKEN="$(gcloud auth print-access-token --project="$GCP_PROJECT")"
PROD_PASS="$(gcloud secrets versions access latest --secret="$PROD_SECRET" --project="$GCP_PROJECT")"
DEV_PASS="$(gcloud secrets versions access latest --secret="$DEV_SECRET" --project="$GCP_PROJECT")"

"$PROXY_BIN" "$PROD_CONN" --port "$PROXY_PROD_PORT" --token "$TOKEN" &
PROXY_PROD_PID=$!
"$PROXY_BIN" "$DEV_CONN" --port "$PROXY_DEV_PORT" --token "$TOKEN" &
PROXY_DEV_PID=$!
sleep 5

echo "==> pg_dump from prod (read-only)"
docker run --rm --network host -e PGPASSWORD="$PROD_PASS" -v "$(dirname "$DUMP_FILE"):/tmp" postgres:16-alpine \
  pg_dump -h host.docker.internal -p "$PROXY_PROD_PORT" -U "$PROD_USER" -d "$PROD_DB" \
    --no-owner --no-acl -Fc -f "/tmp/$(basename "$DUMP_FILE")"

echo "==> pg_restore into dev database $DEV_DB"
docker run --rm --network host -e PGPASSWORD="$DEV_PASS" -v "$(dirname "$DUMP_FILE"):/tmp" postgres:16-alpine \
  pg_restore -h host.docker.internal -p "$PROXY_DEV_PORT" -U "$DEV_USER" -d "$DEV_DB" \
    --clean --if-exists --no-owner --no-acl "/tmp/$(basename "$DUMP_FILE")" || true

echo "==> Dev row counts"
docker run --rm --network host -e PGPASSWORD="$DEV_PASS" postgres:16-alpine \
  psql -h host.docker.internal -p "$PROXY_DEV_PORT" -U "$DEV_USER" -d "$DEV_DB" -c \
  "SELECT 'users' t, COUNT(*) FROM users UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'records', COUNT(*) FROM records;"

echo "==> Done. Production unchanged except optional temporary public IP (reverted above)."
