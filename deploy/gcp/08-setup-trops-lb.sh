#!/usr/bin/env sh
# HTTPS load balancer for trops.taggd.in — single host: GCS SPA (default) + Cloud Run API (path rules).
# Prerequisite: global IP tgddata-trops-ip (8.232.241.48) and client DNS A record trops → that IP.
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

DOMAIN="${TROPS_DOMAIN:-trops.taggd.in}"
IP_NAME="${TROPS_IP_NAME:-tgddata-trops-ip}"
BUCKET_BACKEND="${TROPS_BUCKET_BACKEND:-tgddata-trops-web}"
API_BACKEND="${TROPS_API_BACKEND:-tgddata-trops-api}"
NEG_NAME="${TROPS_NEG_NAME:-tgddata-api-neg}"
URL_MAP="${TROPS_URL_MAP:-tgddata-trops-url-map}"
CERT_NAME="${TROPS_CERT_NAME:-tgddata-trops-cert}"
PROXY_NAME="${TROPS_HTTPS_PROXY:-tgddata-trops-https-proxy}"
FR_NAME="${TROPS_FORWARDING_RULE:-tgddata-trops-https-fr}"

log "Domain=${DOMAIN} project=${GCP_PROJECT}"

if ! gcloud compute addresses describe "${IP_NAME}" --global --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating global IP ${IP_NAME}"
  gcloud compute addresses create "${IP_NAME}" --global --project="${GCP_PROJECT}"
fi
IP="$(gcloud compute addresses describe "${IP_NAME}" --global --project="${GCP_PROJECT}" --format='value(address)')"
log "Static IP ${IP_NAME} = ${IP} (client DNS: A trops → ${IP})"

if ! gcloud compute backend-buckets describe "${BUCKET_BACKEND}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating backend bucket ${BUCKET_BACKEND} → gs://${GCS_WEB_BUCKET}"
  gcloud compute backend-buckets create "${BUCKET_BACKEND}" \
    --project="${GCP_PROJECT}" \
    --gcs-bucket-name="${GCS_WEB_BUCKET}" \
    --enable-cdn
fi

if ! gcloud compute network-endpoint-groups describe "${NEG_NAME}" \
  --region="${GCP_REGION}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating serverless NEG ${NEG_NAME} → Cloud Run ${CLOUD_RUN_SERVICE_API}"
  gcloud compute network-endpoint-groups create "${NEG_NAME}" \
    --project="${GCP_PROJECT}" \
    --region="${GCP_REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${CLOUD_RUN_SERVICE_API}"
fi

if ! gcloud compute backend-services describe "${API_BACKEND}" --global --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating backend service ${API_BACKEND}"
  gcloud compute backend-services create "${API_BACKEND}" \
    --project="${GCP_PROJECT}" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED
  gcloud compute backend-services add-backend "${API_BACKEND}" \
    --project="${GCP_PROJECT}" \
    --global \
    --network-endpoint-group="${NEG_NAME}" \
    --network-endpoint-group-region="${GCP_REGION}"
fi

log "Importing URL map ${URL_MAP}"
gcloud compute url-maps import "${URL_MAP}" \
  --project="${GCP_PROJECT}" \
  --global \
  --source="${_REPO_ROOT}/deploy/gcp/trops-url-map.yaml" \
  --quiet

if ! gcloud compute ssl-certificates describe "${CERT_NAME}" --global --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating managed certificate for ${DOMAIN}"
  gcloud compute ssl-certificates create "${CERT_NAME}" \
    --project="${GCP_PROJECT}" \
    --domains="${DOMAIN}" \
    --global
fi

if ! gcloud compute target-https-proxies describe "${PROXY_NAME}" --global --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating HTTPS proxy ${PROXY_NAME}"
  gcloud compute target-https-proxies create "${PROXY_NAME}" \
    --project="${GCP_PROJECT}" \
    --ssl-certificates="${CERT_NAME}" \
    --url-map="${URL_MAP}" \
    --global
fi

if ! gcloud compute forwarding-rules describe "${FR_NAME}" --global --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  log "Creating forwarding rule ${FR_NAME} on ${IP}"
  gcloud compute forwarding-rules create "${FR_NAME}" \
    --project="${GCP_PROJECT}" \
    --address="${IP_NAME}" \
    --global \
    --target-https-proxy="${PROXY_NAME}" \
    --ports=443
fi

log "LB setup complete. After DNS + cert provision:"
log "  https://${DOMAIN}/"
log "  API + UI same origin: VITE_API_BASE_URL=https://${DOMAIN}"
log "Check cert: gcloud compute ssl-certificates describe ${CERT_NAME} --global --format='yaml(managed)'"
