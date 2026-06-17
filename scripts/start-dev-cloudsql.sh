#!/usr/bin/env bash
# Start local dev against Cloud SQL clone (tgddata_dev). Does NOT touch production.
#
# Prereqs:
#   gcloud auth login shubham@aocr.in
#   gcloud config set project taggd-491107
#
# Usage (from repo root):
#   ./scripts/start-dev-cloudsql.sh
#   ./scripts/start-dev-cloudsql.sh down
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh"

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
RUNTIME_ENV="${REPO_ROOT}/deploy/gcp/.generated/dev-cloudsql.runtime.env"
COMPOSE_FILE="docker-compose.dev.cloudsql.yml"

gcloud config set project "$GCP_PROJECT" --quiet
gcloud config set account "${GCLOUD_ACCOUNT:-shubham@aocr.in}" --quiet 2>/dev/null || true

stop_all() {
  docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" down 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
  pkill -f "cloud-sql-proxy.*${CLOUDSQL_CONNECTION_NAME_DEV}" 2>/dev/null || true
}

stop_local() {
  docker compose -f docker-compose.yml down 2>/dev/null || true
}

if [ "${1:-}" = "down" ]; then
  stop_all
  echo "Stopped local dev stack."
  exit 0
fi

TOKEN="$(gcloud auth print-access-token --project="$GCP_PROJECT")" || {
  echo "ERROR: gcloud auth failed. Run: gcloud auth login shubham@aocr.in" >&2
  exit 1
}

PASS="$(gcloud secrets versions access latest --secret="${CLOUDSQL_SECRET_PASSWORD_DEV}" --project="$GCP_PROJECT")"
ENC_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PASS")"
DB_URL="postgresql+psycopg://${CLOUDSQL_USER_DEV}:${ENC_PASS}@cloud-sql-proxy:5432/${CLOUDSQL_DATABASE_DEV}"
HOST_DB_URL="postgresql+psycopg://${CLOUDSQL_USER_DEV}:${ENC_PASS}@127.0.0.1:${CLOUDSQL_PROXY_PORT_DEV}/${CLOUDSQL_DATABASE_DEV}"

mkdir -p "${REPO_ROOT}/deploy/gcp/.generated"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/lib/set-env-database-url.sh" cloudsql "$HOST_DB_URL"
{
  echo "CLOUDSQL_PROXY_TOKEN=${TOKEN}"
  echo "CLOUDSQL_CONNECTION_NAME_DEV=${CLOUDSQL_CONNECTION_NAME_DEV}"
  echo "DATABASE_URL=${DB_URL}"
} >"$RUNTIME_ENV"

# Merge app secrets from .env if present
if [ -f "${REPO_ROOT}/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "${REPO_ROOT}/.env"; set +a
  {
    [ -n "${GEMINI_API_KEY:-}" ] && echo "GEMINI_API_KEY=${GEMINI_API_KEY}"
    [ -n "${JWT_SECRET:-}" ] && echo "JWT_SECRET=${JWT_SECRET}"
    [ -n "${AUTH_BOOTSTRAP_EMAIL:-}" ] && echo "AUTH_BOOTSTRAP_EMAIL=${AUTH_BOOTSTRAP_EMAIL}"
    [ -n "${AUTH_BOOTSTRAP_PASSWORD:-}" ] && echo "AUTH_BOOTSTRAP_PASSWORD=${AUTH_BOOTSTRAP_PASSWORD}"
  } >>"$RUNTIME_ENV"
fi

stop_local
stop_all
sleep 1

echo "==> Starting Docker (proxy + backend + frontend) → ${CLOUDSQL_DATABASE_DEV}"
docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" up -d --build --force-recreate

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf "http://127.0.0.1:8080/api/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

READY="$(curl -sf "http://127.0.0.1:8080/api/ready" 2>/dev/null || echo '{"status":"starting"}')"
echo ""
echo "Local dev ready:"
echo "  App:  http://127.0.0.1:8080/"
echo "  API:  http://127.0.0.1:8080/api/ready"
echo "  DB:   ${CLOUDSQL_DATABASE_DEV} on ${CLOUDSQL_INSTANCE_DEV} (clone, not prod)"
echo "  Host DATABASE_URL: 127.0.0.1:${CLOUDSQL_PROXY_PORT_DEV} (optional host proxy for psql)"
echo "  Ready: ${READY}"
echo ""
echo "Switch to local empty DB: ./scripts/start-dev-local.sh --fresh"
echo "Stop: ./scripts/start-dev-cloudsql.sh down"
echo "Note: proxy token expires ~1h; re-run this script if DB connection drops."
