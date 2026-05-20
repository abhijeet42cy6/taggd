#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"
load_root_env

ENV_FILE="$(write_cloudrun_env_file)"
log "Wrote ${ENV_FILE}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "Building ${IMAGE_API}:latest"
  gcloud builds submit \
    --project="${GCP_PROJECT}" \
    --config=deploy/gcp/cloudbuild-api.yaml \
    --substitutions="_IMAGE=${IMAGE_API}:latest" \
    .
else
  log "SKIP_BUILD=1 — using existing ${IMAGE_API}:latest"
fi

SECRETS="$(cloudrun_secrets_flags)"
DEPLOY_ARGS=""
if [ -n "${SECRETS}" ]; then
  DEPLOY_ARGS="--set-secrets=${SECRETS}"
  log "Mounting secrets: ${SECRETS}"
else
  load_root_env
  if [ -z "${JWT_SECRET:-}" ]; then
    die "No Cloud Run secrets: create JWT_SECRET in Secret Manager or set JWT_SECRET in .env for dev-only deploy"
  fi
  {
    printf '\nJWT_SECRET=%s\n' "${JWT_SECRET}"
    [ -n "${GEMINI_API_KEY:-}" ] && printf 'GEMINI_API_KEY=%s\n' "${GEMINI_API_KEY}"
  } >>"${ENV_FILE}"
  log "WARNING: JWT/GEMINI written into env file from .env — prefer Secret Manager (JWT_SECRET + GEMINI_API_KEY secrets)"
fi

log "Deploying Cloud Run ${CLOUD_RUN_SERVICE_API}"
# shellcheck disable=SC2086
gcloud run deploy "${CLOUD_RUN_SERVICE_API}" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --image="${IMAGE_API}:latest" \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=2 \
  --memory=2Gi \
  --min-instances=1 \
  --max-instances=10 \
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
printf '%s\n' "${API_URL}" >"${_REPO_ROOT}/deploy/gcp/.generated/api-url.txt"
