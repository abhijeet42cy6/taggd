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

# GCS path-style hosting: storage.googleapis.com/.../app.html#/login → base=./, API=Cloud Run.
if [ -n "${VITE_API_BASE_URL:-}" ] && [ "${VITE_API_BASE_URL%/}" != "${API_URL}" ]; then
  log "Ignoring VITE_API_BASE_URL=${VITE_API_BASE_URL} (GCS deploy uses Cloud Run: ${API_URL})"
fi
export VITE_STATIC_HOSTING=1
GCS_WEB_BASE=./
VITE_API_BASE_URL="${API_URL}"
log "Building frontend VITE_API_BASE_URL=${VITE_API_BASE_URL} VITE_STATIC_HOSTING=${VITE_STATIC_HOSTING} base=${GCS_WEB_BASE}"

cd "${_REPO_ROOT}/frontend"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
VITE_API_BASE_URL="${VITE_API_BASE_URL}" VITE_STATIC_HOSTING="${VITE_STATIC_HOSTING}" npm run build -- --base="${GCS_WEB_BASE}"

if grep -qE 'src="/assets/' dist/index.html 2>/dev/null; then
  die "GCS build has root-absolute /assets in index.html (expected ./assets). Do not set GCS_WEB_BASE=/ for this URL."
fi

log "Uploading to gs://${GCS_WEB_BUCKET}"
# Hashed assets are immutable; long cache is safe.
# Exclude index.html (uploaded separately with no-cache) and legacy group-14004.png (~55MB).
# Single-threaded gsutil is more reliable from laptops with flaky links to storage.googleapis.com.
gsutil -o "GSUtil:parallel_process_count=1" -m rsync -r -d \
  -x 'index\.html$|group-14004\.png$' dist/ "gs://${GCS_WEB_BUCKET}/"
# index.html must not be edge-cached for 1h (default GCS CDN) or users keep a broken /assets/... shell after deploy.
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" \
  -h "Content-Type:text/html" \
  cp dist/index.html "gs://${GCS_WEB_BUCKET}/index.html"
# app.html: same shell as index.html; use when storage.googleapis.com edge cache serves stale index.html.
gsutil -h "Cache-Control:no-cache, no-store, must-revalidate" \
  -h "Content-Type:text/html" \
  cp dist/index.html "gs://${GCS_WEB_BUCKET}/app.html"
# Other HTML entrypoints (if any) should revalidate too.
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

# Public read for static site (tighten with Cloud CDN + IAM later)
gcloud storage buckets add-iam-policy-binding "gs://${GCS_WEB_BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 || log "Set bucket IAM manually if allUsers blocked by org policy"

WEB_URL="https://storage.googleapis.com/${GCS_WEB_BUCKET}/app.html#/login"
log "Web assets (use app.html — index.html may be edge-cached up to ~1h after a bad deploy): ${WEB_URL}"
log "Legacy URL: https://storage.googleapis.com/${GCS_WEB_BUCKET}/index.html#/login"
printf '%s\n' "${WEB_URL}" >"${_REPO_ROOT}/deploy/gcp/.generated/web-url.txt"
