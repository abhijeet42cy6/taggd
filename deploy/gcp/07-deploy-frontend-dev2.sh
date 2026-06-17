#!/usr/bin/env sh
# Build SPA and upload to taggd-tgddata-dev2-web (GCS static hosting).
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
require_cmd npm

export CLOUDSDK_CORE_PROJECT="${GCP_PROJECT}"

API_URL_FILE="${_DEPLOY_GCP_DIR}/.generated/api-url-dev2.txt"
if [ -f "${API_URL_FILE}" ]; then
  API_URL="$(cat "${API_URL_FILE}")"
else
  API_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE_API}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --format='value(status.url)' 2>/dev/null || true)"
fi
[ -n "${API_URL}" ] || die "Deploy API first (06-deploy-api-dev2.sh)"

API_URL="${API_URL%/}"
API_URL="${API_URL%/api}"

export VITE_STATIC_HOSTING=1
GCS_WEB_BASE=./
VITE_API_BASE_URL="${API_URL}"
log "Building frontend VITE_API_BASE_URL=${VITE_API_BASE_URL} VITE_STATIC_HOSTING=${VITE_STATIC_HOSTING} base=${GCS_WEB_BASE}"

if gsutil ls -b "gs://${GCS_WEB_BUCKET}" >/dev/null 2>&1; then
  log "Bucket exists: gs://${GCS_WEB_BUCKET}"
else
  log "Creating bucket gs://${GCS_WEB_BUCKET}"
  gcloud storage buckets create "gs://${GCS_WEB_BUCKET}" \
    --project="${GCP_PROJECT}" \
    --location="${GCP_LOCATION}" \
    --uniform-bucket-level-access
fi

cd "${_REPO_ROOT}/frontend"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
VITE_API_BASE_URL="${VITE_API_BASE_URL}" VITE_STATIC_HOSTING="${VITE_STATIC_HOSTING}" \
  npm run build -- --base="${GCS_WEB_BASE}"

if grep -qE 'src="/assets/' dist/index.html 2>/dev/null; then
  die "GCS build has root-absolute /assets in index.html (expected ./assets)"
fi

log "Uploading to gs://${GCS_WEB_BUCKET}"
gsutil -o "GSUtil:parallel_process_count=1" -m rsync -r -d \
  -x 'index\.html$|group-14004\.png$' dist/ "gs://${GCS_WEB_BUCKET}/"

gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" \
  -h "Content-Type:text/html" \
  cp dist/index.html "gs://${GCS_WEB_BUCKET}/index.html"

gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" \
  -h "Content-Type:text/html" \
  cp dist/index.html "gs://${GCS_WEB_BUCKET}/app.html"

if [ -f dist/taggd-code-of-work.html ]; then
  gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" \
    -h "Content-Type:text/html" \
    cp dist/taggd-code-of-work.html "gs://${GCS_WEB_BUCKET}/taggd-code-of-work.html"
fi

log "Setting website config (SPA fallback)"
gcloud storage buckets update "gs://${GCS_WEB_BUCKET}" \
  --web-main-page-suffix=index.html \
  --web-error-page=index.html \
  --project="${GCP_PROJECT}" 2>/dev/null || true

gcloud storage buckets add-iam-policy-binding "gs://${GCS_WEB_BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 \
  || log "Set bucket IAM manually if allUsers blocked by org policy"

WEB_URL="https://storage.googleapis.com/${GCS_WEB_BUCKET}/app.html#/login"
log "Web URL: ${WEB_URL}"
printf '%s\n' "${WEB_URL}" >"${_DEPLOY_GCP_DIR}/.generated/web-url-dev2.txt"
