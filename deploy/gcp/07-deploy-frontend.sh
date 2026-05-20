#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

API_URL_FILE="${_REPO_ROOT}/deploy/gcp/.generated/api-url.txt"
if [ -f "${API_URL_FILE}" ]; then
  API_URL="$(cat "${API_URL_FILE}")"
else
  API_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE_API}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --format='value(status.url)' 2>/dev/null || true)"
fi
[ -n "${API_URL}" ] || die "Deploy API first (06-deploy-api.sh)"

# Cloud Run serves FastAPI at /auth, /projects, … (no /api prefix). VM nginx strips /api.
# Strip trailing /api if set by mistake (stale docs); ApiPrefixStripMiddleware also handles /api/* on the API.
API_URL="${API_URL%/}"
API_URL="${API_URL%/api}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-${API_URL}}"
VITE_API_BASE_URL="${VITE_API_BASE_URL%/}"
VITE_API_BASE_URL="${VITE_API_BASE_URL%/api}"
# GCS path URL: use relative assets (./) + hash routes (#/login) — no server-side SPA rewrite.
export VITE_STATIC_HOSTING="${VITE_STATIC_HOSTING:-1}"
GCS_WEB_BASE="${GCS_WEB_BASE:-./}"
log "Building frontend VITE_API_BASE_URL=${VITE_API_BASE_URL} VITE_STATIC_HOSTING=${VITE_STATIC_HOSTING} base=${GCS_WEB_BASE}"

cd "${_REPO_ROOT}/frontend"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
VITE_API_BASE_URL="${VITE_API_BASE_URL}" VITE_STATIC_HOSTING="${VITE_STATIC_HOSTING}" npm run build -- --base="${GCS_WEB_BASE}"

log "Uploading to gs://${GCS_WEB_BUCKET}"
# gsutil rsync is reliable for path-style storage.googleapis.com URLs (gcloud storage rsync has had stale index.html).
gsutil -m rsync -r -d dist/ "gs://${GCS_WEB_BUCKET}/"

log "Setting website config (SPA fallback)"
gcloud storage buckets update "gs://${GCS_WEB_BUCKET}" \
  --web-main-page-suffix=index.html \
  --web-error-page=index.html \
  --project="${GCP_PROJECT}" 2>/dev/null || true

# Public read for static site (tighten with Cloud CDN + IAM later)
gcloud storage buckets add-iam-policy-binding "gs://${GCS_WEB_BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 || log "Set bucket IAM manually if allUsers blocked by org policy"

WEB_URL="https://storage.googleapis.com/${GCS_WEB_BUCKET}/index.html#/login"
log "Web assets: ${WEB_URL}"
printf '%s\n' "${WEB_URL}" >"${_REPO_ROOT}/deploy/gcp/.generated/web-url.txt"
