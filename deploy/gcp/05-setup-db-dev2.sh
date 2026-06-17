#!/usr/bin/env sh
# Provision isolated Cloud SQL instance + database for dev2 (tgddata-pg-dev2).
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/config.dev2.env"

_DEPLOY_GCP_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
_REPO_ROOT="$(CDPATH= cd "${_DEPLOY_GCP_DIR}/../.." && pwd)"
cd "${_REPO_ROOT}"

log() { printf '==> [dev2] %s\n' "$*"; }
die() { printf 'ERROR [dev2]: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

require_cmd gcloud
require_cmd openssl
require_cmd python3

export CLOUDSDK_CORE_PROJECT="${GCP_PROJECT}"

log "Enabling required APIs (idempotent)"
gcloud services enable sqladmin.googleapis.com secretmanager.googleapis.com \
  --project="${GCP_PROJECT}" --quiet

if gcloud sql instances describe "${CLOUDSQL_INSTANCE}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Cloud SQL instance exists: ${CLOUDSQL_INSTANCE}"
else
  log "Creating Cloud SQL instance ${CLOUDSQL_INSTANCE} (Postgres 16, enterprise, db-g1-small)"
  gcloud sql instances create "${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --database-version=POSTGRES_16 \
    --edition=enterprise \
    --tier=db-g1-small \
    --region="${GCP_REGION}" \
    --storage-size=10GB \
    --storage-type=SSD \
    --availability-type=zonal \
    --quiet
fi

if gcloud sql databases describe "${CLOUDSQL_DATABASE}" \
  --instance="${CLOUDSQL_INSTANCE}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Database exists: ${CLOUDSQL_DATABASE}"
else
  log "Creating database ${CLOUDSQL_DATABASE}"
  gcloud sql databases create "${CLOUDSQL_DATABASE}" \
    --instance="${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --quiet
fi

if gcloud secrets describe "${CLOUDSQL_SECRET_PASSWORD_DEV2}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Reading existing password secret ${CLOUDSQL_SECRET_PASSWORD_DEV2}"
  DB_PASS="$(gcloud secrets versions access latest \
    --secret="${CLOUDSQL_SECRET_PASSWORD_DEV2}" \
    --project="${GCP_PROJECT}")"
else
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  log "Creating password secret ${CLOUDSQL_SECRET_PASSWORD_DEV2}"
  printf '%s' "${DB_PASS}" | gcloud secrets create "${CLOUDSQL_SECRET_PASSWORD_DEV2}" \
    --project="${GCP_PROJECT}" \
    --replication-policy=automatic \
    --data-file=-
fi

if ! gcloud sql users list --instance="${CLOUDSQL_INSTANCE}" \
  --project="${GCP_PROJECT}" \
  --format='value(name)' | grep -qx "${CLOUDSQL_USER}"; then
  log "Creating database user ${CLOUDSQL_USER}"
  gcloud sql users create "${CLOUDSQL_USER}" \
    --instance="${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --password="${DB_PASS}" \
    --quiet
else
  log "Updating password for user ${CLOUDSQL_USER}"
  gcloud sql users set-password "${CLOUDSQL_USER}" \
    --instance="${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --password="${DB_PASS}" \
    --quiet
fi

DATABASE_URL="$(python3 - <<PY
import urllib.parse
user = "${CLOUDSQL_USER}"
password = urllib.parse.quote("""${DB_PASS}""", safe="")
db = "${CLOUDSQL_DATABASE}"
conn = "${CLOUDSQL_CONNECTION_NAME}"
print(f"postgresql+psycopg://{user}:{password}@/{db}?host=/cloudsql/{conn}&sslmode=disable")
PY
)"

mkdir -p "${_DEPLOY_GCP_DIR}/.generated"

if gcloud secrets describe "${CLOUDSQL_SECRET_DATABASE_URL_DEV2}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Updating secret ${CLOUDSQL_SECRET_DATABASE_URL_DEV2}"
  printf '%s' "${DATABASE_URL}" | gcloud secrets versions add "${CLOUDSQL_SECRET_DATABASE_URL_DEV2}" \
    --project="${GCP_PROJECT}" \
    --data-file=-
else
  log "Creating secret ${CLOUDSQL_SECRET_DATABASE_URL_DEV2}"
  printf '%s' "${DATABASE_URL}" | gcloud secrets create "${CLOUDSQL_SECRET_DATABASE_URL_DEV2}" \
    --project="${GCP_PROJECT}" \
    --replication-policy=automatic \
    --data-file=-
fi

for S in "${CLOUDSQL_SECRET_PASSWORD_DEV2}" "${CLOUDSQL_SECRET_DATABASE_URL_DEV2}"; do
  log "Binding ${S} → ${RUNTIME_SA_EMAIL}"
  gcloud secrets add-iam-policy-binding "${S}" \
    --project="${GCP_PROJECT}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
done

log "dev2 database ready: ${CLOUDSQL_INSTANCE} / ${CLOUDSQL_DATABASE}"
log "Connection name: ${CLOUDSQL_CONNECTION_NAME}"
