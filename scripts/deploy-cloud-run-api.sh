#!/usr/bin/env sh
# Deploy FastAPI backend to Cloud Run (PostgreSQL via Cloud SQL connector).
# Usage (from repo root):
#   source scripts/gcp-cloudsql-tgddata-pg-prod.sh
#   ./scripts/fetch-cloudsql-database-url.sh   # add to .env
#   export JWT_SECRET=... GEMINI_API_KEY=... STORAGE_BUCKET=... CORS_ALLOW_ORIGINS=...
#   ./scripts/deploy-cloud-run-api.sh
set -e
cd "$(dirname "$0")/.."

PROJECT="${GCP_PROJECT:-taggd-491107}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-tgddata-api}"
IMAGE="gcr.io/${PROJECT}/${SERVICE}"
CONNECTION="${CLOUDSQL_CONNECTION_NAME:-taggd-491107:asia-south1:tgddata-pg-prod}"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Set DATABASE_URL (see scripts/fetch-cloudsql-database-url.sh)" >&2
  exit 1
fi
if [ -z "${JWT_SECRET:-}" ]; then
  echo "Set JWT_SECRET" >&2
  exit 1
fi

STORAGE_BACKEND="${STORAGE_BACKEND:-gcs}"
CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-*}"

echo "==> Building ${IMAGE}"
gcloud builds submit --project="${PROJECT}" --tag="${IMAGE}" -f Dockerfile.backend .

echo "==> Deploying Cloud Run ${SERVICE}"
gcloud run deploy "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=2 \
  --memory=2Gi \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=900 \
  --concurrency=80 \
  --add-cloudsql-instances="${CONNECTION}" \
  --set-env-vars="^##^APP_ENV=production##DATABASE_URL=${DATABASE_URL}##JWT_SECRET=${JWT_SECRET}##GEMINI_API_KEY=${GEMINI_API_KEY:-}##STORAGE_BACKEND=${STORAGE_BACKEND}##STORAGE_BUCKET=${STORAGE_BUCKET:-}##CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS}"

echo "==> Service URL:"
gcloud run services describe "${SERVICE}" --project="${PROJECT}" --region="${REGION}" --format='value(status.url)'
