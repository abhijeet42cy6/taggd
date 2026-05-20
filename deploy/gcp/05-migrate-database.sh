#!/usr/bin/env sh
# Run Alembic + optional SQLite data load against Cloud SQL via local Auth Proxy.
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"
load_root_env

PROXY_BIN="${CLOUDSQL_PROXY_BIN:-cloud-sql-proxy}"
PROXY_PORT="${CLOUDSQL_PROXY_PORT:-9470}"
SQLITE_SOURCE="${SQLITE_SOURCE_PATH:-/Users/arjun/Software/tagged_data_sql/revenue_generator.db}"

if [ "${SKIP_DATA_MIGRATION:-0}" = "1" ]; then
  log "SKIP_DATA_MIGRATION=1 — schema only"
else
  [ -f "${SQLITE_SOURCE}" ] || die "SQLite source not found: ${SQLITE_SOURCE}"
fi

_pass="$(secret_value tgddata-pg-prod-db-password)" || die "Cannot read DB password secret"
_user="${CLOUDSQL_USER:-tgddata_app}"
_db="${CLOUDSQL_DATABASE:-tgddata}"
_enc_pass="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${_pass}''', safe=''))")"
export DATABASE_URL="postgresql+psycopg://${_user}:${_enc_pass}@127.0.0.1:${PROXY_PORT}/${_db}"
export PYTHONPATH="${_REPO_ROOT}"

if ! command -v "${PROXY_BIN}" >/dev/null 2>&1; then
  log "Installing cloud-sql-proxy to /tmp"
  ARCH="$(uname -m)"
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$ARCH" in x86_64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; esac
  curl -fsSL -o /tmp/cloud-sql-proxy \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.${OS}.${ARCH}"
  chmod +x /tmp/cloud-sql-proxy
  PROXY_BIN=/tmp/cloud-sql-proxy
fi

log "Starting Cloud SQL Auth Proxy on 127.0.0.1:${PROXY_PORT}"
_PROXY_ARGS=""
if [ "${CLOUDSQL_PROXY_USE_GCLOUD_TOKEN:-1}" = "1" ]; then
  _token="$(gcloud auth print-access-token --project="${GCP_PROJECT}" 2>/dev/null)" || true
  if [ -n "${_token}" ]; then
    _PROXY_ARGS="--token=${_token}"
    log "Proxy auth: gcloud user access token"
  fi
fi
# Use --private-ip only when instance has no public IP and client is on the VPC (see 05-migrate-database-via-public-ip.sh).
_PROXY_IP_ARGS=""
if [ "${CLOUDSQL_PROXY_PRIVATE_IP:-0}" = "1" ]; then
  _PROXY_IP_ARGS="--private-ip"
fi
"${PROXY_BIN}" "${CLOUDSQL_CONNECTION_NAME}" --port "${PROXY_PORT}" ${_PROXY_IP_ARGS} ${_PROXY_ARGS} &
PROXY_PID=$!
trap 'kill "${PROXY_PID}" 2>/dev/null || true' EXIT
sleep 3

log "Alembic upgrade"
alembic upgrade head

if [ "${SKIP_DATA_MIGRATION:-0}" != "1" ]; then
  log "SQLite → Postgres data migration"
  python3 -m backend.scripts.migrate_sqlite_to_postgres \
    --source "${SQLITE_SOURCE}" \
    --truncate \
    --skip-alembic
fi

log "Database migration complete"
