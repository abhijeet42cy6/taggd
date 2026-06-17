#!/usr/bin/env sh
# Print DATABASE_URL for local dev against Cloud SQL clone (tgddata_dev).
# Does NOT read or write production tgddata-pg-prod.
set -e
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
[ -f scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh ] && . scripts/gcp-cloudsql-tgddata-pg-prod-dev.sh

PROJECT="${GCP_PROJECT:-taggd-491107}"
SECRET="${CLOUDSQL_SECRET_PASSWORD_DEV:-tgddata-pg-prod-dev-db-password}"
USER="${CLOUDSQL_USER_DEV:-tgddata_app}"
DB="${CLOUDSQL_DATABASE_DEV:-tgddata_dev}"
CONN="${CLOUDSQL_CONNECTION_NAME_DEV:-taggd-491107:asia-south1:tgddata-pg-prod-dev}"

PASS="$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT")"
printf 'DATABASE_URL=postgresql+psycopg://%s:%s@/%s?host=/cloudsql/%s&sslmode=disable\n' "$USER" "$PASS" "$DB" "$CONN"
