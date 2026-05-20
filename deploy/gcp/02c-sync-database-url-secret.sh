#!/usr/bin/env sh
# Create/update Secret Manager TGDDATA_DATABASE_URL (full Cloud SQL URL for Cloud Run).
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

URL="$(build_database_url_cloudsql)"
printf '%s' "${URL}" | gcloud secrets describe TGDDATA_DATABASE_URL --project="${GCP_PROJECT}" >/dev/null 2>&1 &&
  printf '%s' "${URL}" | gcloud secrets versions add TGDDATA_DATABASE_URL --project="${GCP_PROJECT}" --data-file=- ||
  printf '%s' "${URL}" | gcloud secrets create TGDDATA_DATABASE_URL --project="${GCP_PROJECT}" --data-file=-

log "Secret TGDDATA_DATABASE_URL updated. Grant runtime SA access via 03b-bind-runtime-secrets.sh"
