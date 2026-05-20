#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

_create_bucket() {
  _b="$1"
  if gsutil ls -b "gs://${_b}" >/dev/null 2>&1; then
    log "Bucket exists: gs://${_b}"
  else
    log "Creating bucket gs://${_b} (${GCP_LOCATION})"
    gcloud storage buckets create "gs://${_b}" \
      --project="${GCP_PROJECT}" \
      --location="${GCP_LOCATION}" \
      --uniform-bucket-level-access
  fi
}

_create_bucket "${GCS_UPLOADS_BUCKET}"
_create_bucket "${GCS_WEB_BUCKET}"

log "Uploads bucket: gs://${GCS_UPLOADS_BUCKET}"
log "Web bucket: gs://${GCS_WEB_BUCKET}"
