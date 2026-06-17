#!/usr/bin/env sh
# Build and deploy tgddata-api-dev2 to Cloud Run (isolated dev2 stack).
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
require_cmd gsutil

export CLOUDSDK_CORE_PROJECT="${GCP_PROJECT}"

if [ -f "${_REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${_REPO_ROOT}/.env"
  set +a
fi

gcloud secrets describe "${CLOUDSQL_SECRET_DATABASE_URL_DEV2}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 \
  || die "Run 05-setup-db-dev2.sh first (missing ${CLOUDSQL_SECRET_DATABASE_URL_DEV2})"

_create_bucket() {
  _b="$1"
  if gsutil ls -b "gs://${_b}" >/dev/null 2>&1; then
    log "Bucket exists: gs://${_b}"
  else
    log "Creating bucket gs://${_b}"
    gcloud storage buckets create "gs://${_b}" \
      --project="${GCP_PROJECT}" \
      --location="${GCP_LOCATION}" \
      --uniform-bucket-level-access
  fi
}

_create_bucket "${GCS_UPLOADS_BUCKET}"

mkdir -p "${_DEPLOY_GCP_DIR}/.generated"
ENV_FILE="${_DEPLOY_GCP_DIR}/.generated/cloudrun-api-dev2.env"
_write_env_file() {
  _cors="$1"
  {
    echo "APP_ENV=${APP_ENV}"
    echo "STORAGE_BACKEND=${STORAGE_BACKEND}"
    echo "STORAGE_BUCKET=${GCS_UPLOADS_BUCKET}"
    echo "STORAGE_PREFIX=${STORAGE_PREFIX}"
    echo "CORS_ALLOW_ORIGINS=${_cors}"
    echo "SKIP_INIT_BACKFILLS=true"
    [ -n "${AUTH_BOOTSTRAP_EMAIL:-}" ] && echo "AUTH_BOOTSTRAP_EMAIL=${AUTH_BOOTSTRAP_EMAIL}"
    [ -n "${AUTH_BOOTSTRAP_PASSWORD:-}" ] && echo "AUTH_BOOTSTRAP_PASSWORD=${AUTH_BOOTSTRAP_PASSWORD}"
  } >"${ENV_FILE}"
}

_write_env_file "${CORS_ALLOW_ORIGINS}"
log "Wrote ${ENV_FILE}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "Building ${IMAGE_API}"
  gcloud builds submit \
    --project="${GCP_PROJECT}" \
    --config=deploy/gcp/cloudbuild-api.yaml \
    --substitutions="_IMAGE=${IMAGE_API}" \
    .
else
  log "SKIP_BUILD=1 — using existing ${IMAGE_API}"
fi

SECRETS="DATABASE_URL=${CLOUDSQL_SECRET_DATABASE_URL_DEV2}:latest"
if gcloud secrets describe JWT_SECRET --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  SECRETS="${SECRETS},JWT_SECRET=JWT_SECRET:latest"
fi
if gcloud secrets describe GEMINI_API_KEY --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  SECRETS="${SECRETS},GEMINI_API_KEY=GEMINI_API_KEY:latest"
fi

log "Deploying Cloud Run ${CLOUD_RUN_SERVICE_API}"
DEPLOY_ARGS="--set-secrets=${SECRETS}"

# shellcheck disable=SC2086
gcloud run deploy "${CLOUD_RUN_SERVICE_API}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --image="${IMAGE_API}" \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=900 \
  --concurrency=80 \
  --add-cloudsql-instances="${CLOUDSQL_CONNECTION_NAME}" \
  --vpc-connector="${VPC_CONNECTOR}" \
  --vpc-egress=private-ranges-only \
  --env-vars-file="${ENV_FILE}" \
  ${DEPLOY_ARGS}

API_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE_API}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)')"
log "API URL: ${API_URL}"
printf '%s\n' "${API_URL}" >"${_DEPLOY_GCP_DIR}/.generated/api-url-dev2.txt"

CORS_ORIGINS="${CORS_ALLOW_ORIGINS}"
if [ -n "${API_URL}" ]; then
  CORS_ORIGINS="${CORS_ORIGINS},${API_URL}"
fi
WEB_ORIGIN="https://storage.googleapis.com"
if [ -n "${GCS_WEB_BUCKET}" ]; then
  CORS_ORIGINS="${CORS_ORIGINS},${WEB_ORIGIN}"
fi

_write_env_file "${CORS_ORIGINS}"

log "Updating CORS_ALLOW_ORIGINS=${CORS_ORIGINS}"
# shellcheck disable=SC2086
gcloud run services update "${CLOUD_RUN_SERVICE_API}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --env-vars-file="${ENV_FILE}" \
  ${DEPLOY_ARGS}

log "dev2 API deployed: ${API_URL}"
