#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

if ! gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating service account ${RUNTIME_SA_EMAIL}"
  gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
    --project="${GCP_PROJECT}" \
    --display-name="tgddata Cloud Run runtime"
else
  log "Service account exists: ${RUNTIME_SA_EMAIL}"
fi

_bind() {
  gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
    --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role="$1" \
    --condition=None >/dev/null
}

log "Binding project roles"
_bind roles/cloudsql.client
_bind roles/secretmanager.secretAccessor
_bind roles/logging.logWriter
log "Grant vpcaccess.user for Serverless VPC connector (Cloud SQL private IP)"
_bind roles/vpcaccess.user

log "Binding storage on gs://${GCS_UPLOADS_BUCKET}"
gcloud storage buckets add-iam-policy-binding "gs://${GCS_UPLOADS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role=roles/storage.objectAdmin \
  --project="${GCP_PROJECT}" >/dev/null

log "Runtime SA ready: ${RUNTIME_SA_EMAIL}"
