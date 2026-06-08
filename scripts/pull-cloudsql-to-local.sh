#!/usr/bin/env bash
# Read-only pull: Cloud SQL tgddata-pg-prod → local Docker Compose Postgres.
# Does NOT deploy or write to Cloud Run / Cloud SQL (pg_dump only).
#
# Prereqs: gcloud auth login, roles/cloudsql.client (via VM SA), IAP SSH to VM.
#
# Usage (from repo root):
#   ./scripts/pull-cloudsql-to-local.sh
#   LOCAL_DUMP_DIR=/path/to/dir ./scripts/pull-cloudsql-to-local.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-env-tgddata-c1-prod-2.sh"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod.sh"

LOCAL_DUMP_DIR="${LOCAL_DUMP_DIR:-/Users/arjun/Software/tagged_data_sql}"
REMOTE_USER="${REMOTE_USER:-arjun}"
PROXY_PORT="${CLOUDSQL_PROXY_PORT:-9470}"
LOCAL_PG_USER="${POSTGRES_USER:-tgddata}"
LOCAL_PG_PASS="${POSTGRES_PASSWORD:-tgddata_dev}"
LOCAL_PG_DB="${POSTGRES_DB:-tgddata}"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet >/dev/null

STAMP=$(date +%Y%m%d%H%M%S)
DUMP_NAME="tgddata-cloudsql-${STAMP}.dump"
LOCAL_DUMP="${LOCAL_DUMP_DIR}/${DUMP_NAME}"

mkdir -p "$LOCAL_DUMP_DIR"

_db_pass="$(gcloud secrets versions access latest \
  --secret="${CLOUDSQL_SECRET_PASSWORD}" \
  --project="${GCP_PROJECT}")" || {
  echo "ERROR: Cannot read secret ${CLOUDSQL_SECRET_PASSWORD}. Run: gcloud auth login" >&2
  exit 1
}

_gcloud_token="$(gcloud auth print-access-token --project="${GCP_PROJECT}")" || {
  echo "ERROR: gcloud auth print-access-token failed. Run: gcloud auth login" >&2
  exit 1
}

echo "==> Cloud SQL read-only dump via ${GCP_INSTANCE} (private IP Auth Proxy)"
gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="
set -euo pipefail
CONN='${CLOUDSQL_CONNECTION_NAME}'
USER='${CLOUDSQL_USER}'
DB='${CLOUDSQL_DATABASE}'
PORT=${PROXY_PORT}
OUT=\$HOME/${DUMP_NAME}
PROXY=/tmp/cloud-sql-proxy-pull
PASS='$(python3 -c "import shlex; print(shlex.quote('''${_db_pass}'''))")'
GCLOUD_TOKEN='$(python3 -c "import shlex; print(shlex.quote('''${_gcloud_token}'''))")'
fuser -k \"\$PORT\"/tcp 2>/dev/null || true
pkill -f \"cloud-sql-proxy.*\$PORT\" 2>/dev/null || true
sleep 1
if [ ! -x \"\$PROXY\" ]; then
  curl -fsSL -o \"\$PROXY\" https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64
  chmod +x \"\$PROXY\"
fi
echo '==> Auth Proxy (private IP) on 127.0.0.1:'\"\$PORT\"
\"\$PROXY\" \"\$CONN\" --port \"\$PORT\" --private-ip --token=\"\$GCLOUD_TOKEN\" &
PROXY_PID=\$!
trap 'kill \"\$PROXY_PID\" 2>/dev/null || true' EXIT
sleep 5
echo '==> pg_dump (read-only)'
docker run --rm --network host \
  -e PGPASSWORD=\"\$PASS\" \
  -v \"\$HOME:/out\" \
  postgres:16-alpine \
  pg_dump -h 127.0.0.1 -p \"\$PORT\" -U \"\$USER\" -d \"\$DB\" \
    --no-owner --no-acl -Fc -f \"/out/${DUMP_NAME}\"
ls -lah \"\$OUT\"
"

echo "==> Downloading dump to ${LOCAL_DUMP}"
gcloud compute scp \
  "${REMOTE_USER}@${GCP_INSTANCE}:~/${DUMP_NAME}" \
  "${LOCAL_DUMP}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap

echo "==> Removing temporary dump on VM"
gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="rm -f ~/${DUMP_NAME}" || true

echo "==> Local Postgres: start postgres, stop app containers during restore"
docker compose stop backend frontend 2>/dev/null || true
docker compose up -d postgres
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose exec -T postgres pg_isready -U "${LOCAL_PG_USER}" -d "${LOCAL_PG_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> pg_restore into local ${LOCAL_PG_DB} (local only)"
docker run --rm --network host \
  -v "${LOCAL_DUMP_DIR}:/dump:ro" \
  -e PGPASSWORD="${LOCAL_PG_PASS}" \
  postgres:16-alpine \
  pg_restore -h 127.0.0.1 -p 5432 -U "${LOCAL_PG_USER}" -d "${LOCAL_PG_DB}" \
    --clean --if-exists --no-owner --no-acl \
    "/dump/${DUMP_NAME}" || true

echo "==> Local row counts"
docker compose exec -T postgres psql -U "${LOCAL_PG_USER}" -d "${LOCAL_PG_DB}" -c \
  "SELECT 'users' AS t, COUNT(*) FROM users UNION ALL SELECT 'project_contracts', COUNT(*) FROM project_contracts UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'records', COUNT(*) FROM records;"

docker compose start backend frontend 2>/dev/null || docker compose up -d backend frontend 2>/dev/null || true

echo "==> Done. Cloud unchanged. Dump saved: ${LOCAL_DUMP}"
echo "    Local API: docker compose up -d  →  http://127.0.0.1:8080/"
