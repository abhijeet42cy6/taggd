#!/usr/bin/env sh
# SQLite → Cloud SQL via GCE VM in the same VPC (private IP only; no public IP toggle).
#
# Uses tgddata-c1-prod-2 + Cloud SQL Auth Proxy (--private-ip) + API container for Alembic/migrate.
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"
# shellcheck disable=SC1091
. "${_REPO_ROOT}/scripts/gcp-env-tgddata-c1-prod-2.sh"

SQLITE_LOCAL="${SQLITE_SOURCE_PATH:-/Users/arjun/Software/tagged_data_sql/revenue_generator.db}"
REMOTE_DB="/tmp/tgddata-migrate-revenue_generator.db"
REMOTE_SH="/tmp/tgddata-run-migrate-$$.sh"
IMAGE="${IMAGE_API:-asia-south1-docker.pkg.dev/${GCP_PROJECT}/tgddata/api}:latest"

[ -f "${SQLITE_LOCAL}" ] || die "SQLite not found: ${SQLITE_LOCAL}"

log "Uploading SQLite ($(du -h "${SQLITE_LOCAL}" | awk '{print $1}')) → ${GCP_INSTANCE}:${REMOTE_DB}"
gcloud compute scp --tunnel-through-iap \
  --project="${GCP_PROJECT}" \
  --zone="${GCP_ZONE}" \
  "${SQLITE_LOCAL}" \
  "${GCP_INSTANCE}:${REMOTE_DB}"

log "Writing remote migration script"
cat >"${REMOTE_SH}" <<'REMOTE_HEAD'
#!/bin/bash
set -euo pipefail
REMOTE_HEAD

cat >>"${REMOTE_SH}" <<REMOTE_VARS
CONN='${CLOUDSQL_CONNECTION_NAME}'
PROJECT='${GCP_PROJECT}'
IMAGE='${IMAGE}'
REMOTE_DB='${REMOTE_DB}'
USER='${CLOUDSQL_USER:-tgddata_app}'
DB='${CLOUDSQL_DATABASE:-tgddata}'
PROXY_PORT='${CLOUDSQL_PROXY_PORT:-9470}'
REMOTE_VARS

cat >>"${REMOTE_SH}" <<'REMOTE_BODY'
PROXY=/tmp/cloud-sql-proxy-migrate
if [ ! -x "$PROXY" ]; then
  curl -fsSL -o "$PROXY" \
    https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64
  chmod +x "$PROXY"
fi

PASS="$(gcloud secrets versions access latest --secret=tgddata-pg-prod-db-password --project="$PROJECT")"
ENC_PASS="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${PASS}''', safe=''))")"

echo "==> Cloud SQL Auth Proxy (private IP) on 127.0.0.1:${PROXY_PORT}"
"$PROXY" "$CONN" --port "${PROXY_PORT}" --private-ip &
PPID=$!
trap 'kill "$PPID" 2>/dev/null || true' EXIT
sleep 4

export DATABASE_URL="postgresql+psycopg://${USER}:${ENC_PASS}@127.0.0.1:${PROXY_PORT}/${DB}"

echo "==> Pulling API image (if needed)"
docker pull "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE"

echo "==> Alembic + data migration in container"
docker run --rm --network host \
  -v "${REMOTE_DB}:/data/source.db:ro" \
  -e "DATABASE_URL=${DATABASE_URL}" \
  -e PYTHONPATH=/app \
  "$IMAGE" \
  sh -c 'alembic upgrade head && python3 -m backend.scripts.migrate_sqlite_to_postgres --source /data/source.db --truncate --skip-alembic'

rm -f "${REMOTE_DB}"
echo "==> VM migration complete"
REMOTE_BODY

gcloud compute scp --tunnel-through-iap \
  --project="${GCP_PROJECT}" \
  --zone="${GCP_ZONE}" \
  "${REMOTE_SH}" \
  "${GCP_INSTANCE}:${REMOTE_SH}"

log "Executing migration on ${GCP_INSTANCE} (IAP SSH; may take 10–30 min)"
gcloud compute ssh "${GCP_INSTANCE}" \
  --project="${GCP_PROJECT}" \
  --zone="${GCP_ZONE}" \
  --tunnel-through-iap \
  --command="chmod +x ${REMOTE_SH} && ${REMOTE_SH}"

rm -f "${REMOTE_SH}"
log "Done. Verify: curl -s https://tgddata-api-lnucyjw2sa-el.a.run.app/ready"
