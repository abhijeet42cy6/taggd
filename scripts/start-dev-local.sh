#!/usr/bin/env bash
# Start local dev against Docker Postgres (empty schema on --fresh). Does NOT touch Cloud SQL.
#
# Usage (from repo root):
#   ./scripts/start-dev-local.sh
#   ./scripts/start-dev-local.sh --fresh
#   ./scripts/start-dev-local.sh --build
#   ./scripts/start-dev-local.sh --fresh --build
#   ./scripts/start-dev-local.sh down
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh"

COMPOSE_BASE_FILE="docker-compose.yml"
COMPOSE_HOT_FILE="docker-compose.dev.hot.yml"
RUNTIME_ENV="${REPO_ROOT}/deploy/gcp/.generated/dev-cloudsql.runtime.env"
FRESH=false
DO_BUILD=false

compose_cmd() {
  docker compose -f "$COMPOSE_BASE_FILE" -f "$COMPOSE_HOT_FILE" "$@"
}

if [ "${1:-}" = "down" ]; then
  compose_cmd down 2>/dev/null || true
  echo "Stopped local dev stack."
  exit 0
fi

for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=true ;;
    --build) DO_BUILD=true ;;
    down) ;;
    "")
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--fresh] [--build] | down"
      exit 1
      ;;
  esac
done

if [ -f "${REPO_ROOT}/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "${REPO_ROOT}/.env"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-tgddata}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-tgddata_dev}"
POSTGRES_DB="${POSTGRES_DB:-tgddata}"

stop_cloudsql() {
  docker compose --env-file "$RUNTIME_ENV" -f docker-compose.dev.cloudsql.yml down 2>/dev/null || \
    docker compose -f docker-compose.dev.cloudsql.yml down 2>/dev/null || true
  pkill -f "cloud-sql-proxy.*${CLOUDSQL_CONNECTION_NAME_DEV}" 2>/dev/null || true
}

stop_cloudsql
sleep 1

if [ "$FRESH" = true ]; then
  echo "==> Removing local Postgres volume (empty database on next start)"
  compose_cmd down -v 2>/dev/null || true
else
  compose_cmd down 2>/dev/null || true
fi

ENC_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$POSTGRES_PASSWORD")"
HOST_DB_URL="postgresql+psycopg://${POSTGRES_USER}:${ENC_PASS}@127.0.0.1:5432/${POSTGRES_DB}"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/lib/set-env-database-url.sh" local "$HOST_DB_URL"

echo "==> Starting Docker hot-dev stack (postgres + adminer + backend --reload + frontend Vite HMR)"
if [ "$DO_BUILD" = true ]; then
  compose_cmd up -d --build
else
  compose_cmd up -d
fi

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf "http://127.0.0.1:8080/api/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

READY="$(curl -sf "http://127.0.0.1:8080/api/ready" 2>/dev/null || echo '{"status":"starting"}')"
BOOTSTRAP_EMAIL="${AUTH_BOOTSTRAP_EMAIL:-admin@test.local}"
BOOTSTRAP_PASSWORD="${AUTH_BOOTSTRAP_PASSWORD:-}"

echo ""
echo "Local dev ready:"
echo "  App:     http://127.0.0.1:8080/"
echo "  API:     http://127.0.0.1:8080/api/ready"
echo "  Adminer: http://127.0.0.1:8081/"
echo "  DB host: 127.0.0.1:5432 (${POSTGRES_DB})"
echo "  Adminer login: System=PostgreSQL, Server=postgres, User=${POSTGRES_USER}, Password=${POSTGRES_PASSWORD}, Database=${POSTGRES_DB}"
if [ -n "$BOOTSTRAP_PASSWORD" ]; then
  echo "  App login (empty DB): ${BOOTSTRAP_EMAIL} / (see AUTH_BOOTSTRAP_PASSWORD in .env)"
else
  echo "  App login: set AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD in .env for first admin"
fi
echo "  Ready: ${READY}"
echo ""
echo "Switch to GCP dev clone: ./scripts/start-dev-cloudsql.sh"
echo "Stop: ./scripts/start-dev-local.sh down"
if [ "$FRESH" = true ]; then
  echo "Note: --fresh wiped the local Postgres volume; schema is recreated on backend start."
fi
if [ "$DO_BUILD" = true ]; then
  echo "Note: --build rebuilt local images before startup."
else
  echo "Tip: pass --build only when Dockerfile/dependency layers change."
fi
