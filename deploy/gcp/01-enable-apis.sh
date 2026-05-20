#!/usr/bin/env sh
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"
log "Enabling APIs on ${GCP_PROJECT}"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project="${GCP_PROJECT}"
