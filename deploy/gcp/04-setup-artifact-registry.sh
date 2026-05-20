#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

if gcloud artifacts repositories describe "${AR_REPO}" \
  --location="${GCP_REGION}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Artifact Registry repo exists: ${AR_REPO}"
else
  log "Creating Artifact Registry ${AR_REPO} in ${GCP_REGION}"
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${GCP_REGION}" \
    --project="${GCP_PROJECT}" \
    --description="tgddata containers"
fi

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

log "API image: ${IMAGE_API}:latest"
