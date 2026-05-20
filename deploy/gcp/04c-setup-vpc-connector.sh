#!/usr/bin/env sh
# Serverless VPC Access connector (required for Cloud Run → Cloud SQL private IP).
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

gcloud services enable vpcaccess.googleapis.com --project="${GCP_PROJECT}" --quiet

if gcloud compute networks vpc-access connectors describe "${VPC_CONNECTOR}" \
  --region="${GCP_REGION}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "VPC connector exists: ${VPC_CONNECTOR}"
else
  log "Creating VPC connector ${VPC_CONNECTOR} (≈3–8 min)"
  gcloud compute networks vpc-access connectors create "${VPC_CONNECTOR}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --network=default \
    --range="${VPC_CONNECTOR_CIDR:-10.8.208.0/28}" \
    --quiet
fi

STATE="$(gcloud compute networks vpc-access connectors describe "${VPC_CONNECTOR}" \
  --region="${GCP_REGION}" \
  --project="${GCP_PROJECT}" \
  --format='value(state)' 2>/dev/null || echo UNKNOWN)"
log "Connector state: ${STATE}"
[ "${STATE}" = READY ] || log "Wait until READY, then run 06-deploy-api.sh again"
