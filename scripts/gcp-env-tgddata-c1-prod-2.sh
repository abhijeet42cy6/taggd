# Step 2: point deploy + DB promote at tgddata-c1-prod-2
# Usage:  source scripts/gcp-env-tgddata-c1-prod-2.sh
# Then:   ./scripts/deploy-gcp.sh   or   ./scripts/promote-db-to-gcp.sh
export GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
export GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
export GCP_INSTANCE="${GCP_INSTANCE:-tgddata-c1-prod-2}"
export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
# After deploy, run scripts/setup-host-nginx-certbot-taggd.sh on the VM (see DEPLOYMENT_DOC.md §5b).
export TGDDATA_HOST_TLS_SETUP="${TGDDATA_HOST_TLS_SETUP:-1}"
