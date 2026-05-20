# Cloud SQL instance created for tgddata PostgreSQL production.
# Usage: source scripts/gcp-cloudsql-tgddata-pg-prod.sh
#
# Prerequisites on VM: Cloud SQL Auth Proxy + access to Secret Manager secret.

export GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
export GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
export CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-tgddata-pg-prod}"
export CLOUDSQL_CONNECTION_NAME="${CLOUDSQL_CONNECTION_NAME:-taggd-491107:asia-south1:tgddata-pg-prod}"
export CLOUDSQL_DATABASE="${CLOUDSQL_DATABASE:-tgddata}"
export CLOUDSQL_USER="${CLOUDSQL_USER:-tgddata_app}"
export CLOUDSQL_PRIVATE_IP="${CLOUDSQL_PRIVATE_IP:-172.23.0.3}"
export CLOUDSQL_SECRET_PASSWORD="${CLOUDSQL_SECRET_PASSWORD:-tgddata-pg-prod-db-password}"

# Unix socket via Auth Proxy (recommended on GCE VM in same VPC):
#   cloud-sql-proxy --unix-socket /cloudsql ${CLOUDSQL_CONNECTION_NAME}
# DATABASE_URL shape:
#   postgresql+psycopg://${CLOUDSQL_USER}:PASSWORD@/tgddata?host=/cloudsql/${CLOUDSQL_CONNECTION_NAME}

# Private IP direct (VM must be on default VPC with route to 172.23.0.0/16 peering):
#   postgresql+psycopg://${CLOUDSQL_USER}:PASSWORD@${CLOUDSQL_PRIVATE_IP}:5432/${CLOUDSQL_DATABASE}
