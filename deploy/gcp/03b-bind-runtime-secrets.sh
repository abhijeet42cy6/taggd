#!/usr/bin/env sh
# Grant secretsAccessor on app secrets to the Cloud Run runtime SA (if org requires resource-level IAM).
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

for S in TGDDATA_DATABASE_URL JWT_SECRET GEMINI_API_KEY tgddata-pg-prod-db-password; do
  if gcloud secrets describe "$S" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
    log "Binding $S → ${RUNTIME_SA_EMAIL}"
    gcloud secrets add-iam-policy-binding "$S" \
      --project="${GCP_PROJECT}" \
      --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet 2>/dev/null || true
  fi
done
