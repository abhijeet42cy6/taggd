#!/usr/bin/env sh
# Full GCP bootstrap: APIs → storage → IAM → AR → DB migrate → API → frontend
set -e
DIR="$(dirname "$0")"
sh "${DIR}/01-enable-apis.sh"
sh "${DIR}/02-setup-storage.sh"
sh "${DIR}/02c-sync-database-url-secret.sh"
sh "${DIR}/03-setup-iam.sh"
sh "${DIR}/03b-bind-runtime-secrets.sh"
sh "${DIR}/04-setup-artifact-registry.sh"
sh "${DIR}/04c-setup-vpc-connector.sh"
if [ "${SKIP_DB_MIGRATION:-0}" = "1" ]; then
  echo "Skipping 05-migrate-database.sh (SKIP_DB_MIGRATION=1); schema runs on API boot"
else
  sh "${DIR}/05-migrate-database-on-vm.sh" || {
    echo "WARN: VM DB migration failed. Schema still runs on API boot; retry 05-migrate-database-on-vm.sh."
  }
fi
sh "${DIR}/06-deploy-api.sh"
sh "${DIR}/07-deploy-frontend.sh"
echo ""
echo "Done. See deploy/gcp/.generated/ for URLs."
