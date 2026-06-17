# Cloud SQL dev clone (copy of tgddata-pg-prod for local testing).
# Usage: source scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh

export GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
export GCP_REGION="${GCP_REGION:-asia-south1}"
export CLOUDSQL_INSTANCE_DEV="${CLOUDSQL_INSTANCE_DEV:-tgddata-pg-prod-dev}"
export CLOUDSQL_CONNECTION_NAME_DEV="${CLOUDSQL_CONNECTION_NAME_DEV:-taggd-491107:asia-south1:tgddata-pg-prod-dev}"
export CLOUDSQL_DATABASE_DEV="${CLOUDSQL_DATABASE_DEV:-tgddata_dev}"
export CLOUDSQL_USER_DEV="${CLOUDSQL_USER_DEV:-tgddata_app}"
export CLOUDSQL_SECRET_PASSWORD_DEV="${CLOUDSQL_SECRET_PASSWORD_DEV:-tgddata-pg-prod-dev-db-password}"
export CLOUDSQL_PROXY_PORT_DEV="${CLOUDSQL_PROXY_PORT_DEV:-9472}"
