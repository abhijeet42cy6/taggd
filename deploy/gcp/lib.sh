#!/usr/bin/env sh
# Shared helpers for deploy/gcp scripts. Source from repo root.
set -e
_DEPLOY_GCP_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
_REPO_ROOT="$(CDPATH= cd "${_DEPLOY_GCP_DIR}/../.." && pwd)"
cd "${_REPO_ROOT}"

# shellcheck disable=SC1091
. "${_DEPLOY_GCP_DIR}/config.defaults.env"

export CLOUDSDK_CORE_PROJECT="${GCP_PROJECT}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

require_cmd gcloud
require_cmd gsutil

load_root_env() {
  if [ -f "${_REPO_ROOT}/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "${_REPO_ROOT}/.env"
    set +a
  fi
}

secret_value() {
  gcloud secrets versions access latest --secret="$1" --project="${GCP_PROJECT}" 2>/dev/null
}

build_database_url_cloudsql() {
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "${DATABASE_URL}"
    return 0
  fi
  _pass="$(secret_value tgddata-pg-prod-db-password)" || die "Cannot read tgddata-pg-prod-db-password"
  _user="${CLOUDSQL_USER:-tgddata_app}"
  _db="${CLOUDSQL_DATABASE:-tgddata}"
  python3 - <<PY
import urllib.parse
u = "${_user}"
p = urllib.parse.quote("""${_pass}""", safe="")
db = "${_db}"
conn = "${CLOUDSQL_CONNECTION_NAME}"
# Cloud SQL Unix socket (Auth proxy / Cloud Run connector) does not use TLS on the socket.
print(f"postgresql+psycopg://{u}:{p}@/{db}?host=/cloudsql/{conn}&sslmode=disable")
PY
}

write_cloudrun_env_file() {
  _out="${_REPO_ROOT}/deploy/gcp/.generated/cloudrun-api.env"
  mkdir -p "${_REPO_ROOT}/deploy/gcp/.generated"
  _db_url="$(build_database_url_cloudsql)"
  {
    echo "APP_ENV=${APP_ENV}"
    echo "STORAGE_BACKEND=${STORAGE_BACKEND}"
    echo "STORAGE_BUCKET=${GCS_UPLOADS_BUCKET}"
    echo "STORAGE_PREFIX=${STORAGE_PREFIX}"
    echo "CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS}"
    if ! gcloud secrets describe TGDDATA_DATABASE_URL --project="${GCP_PROJECT}" >/dev/null 2>&1; then
      echo "DATABASE_URL=${_db_url}"
    fi
  } >"${_out}"
  printf '%s' "${_out}"
}

cloudrun_secrets_flags() {
  _flags=""
  if gcloud secrets describe TGDDATA_DATABASE_URL --project="${GCP_PROJECT}" >/dev/null 2>&1; then
    _flags="${_flags}DATABASE_URL=TGDDATA_DATABASE_URL:latest,"
  fi
  if gcloud secrets describe JWT_SECRET --project="${GCP_PROJECT}" >/dev/null 2>&1; then
    _flags="${_flags}JWT_SECRET=JWT_SECRET:latest,"
  fi
  if gcloud secrets describe GEMINI_API_KEY --project="${GCP_PROJECT}" >/dev/null 2>&1; then
    _flags="${_flags}GEMINI_API_KEY=GEMINI_API_KEY:latest,"
  fi
  _flags="${_flags%,}"
  printf '%s' "${_flags}"
}
