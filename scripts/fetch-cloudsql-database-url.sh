#!/usr/bin/env sh
# Print DATABASE_URL for .env on a GCP VM (password from Secret Manager).
# Requires: gcloud auth, secret accessor on tgddata-pg-prod-db-password
set -e
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
[ -f scripts/gcp-cloudsql-tgddata-pg-prod.sh ] && . scripts/gcp-cloudsql-tgddata-pg-prod.sh

PROJECT="${GCP_PROJECT:-taggd-491107}"
SECRET="${CLOUDSQL_SECRET_PASSWORD:-tgddata-pg-prod-db-password}"
USER="${CLOUDSQL_USER:-tgddata_app}"
DB="${CLOUDSQL_DATABASE:-tgddata}"
CONN="${CLOUDSQL_CONNECTION_NAME:-taggd-491107:asia-south1:tgddata-pg-prod}"

PASS="$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT")"
# URL-encode not applied; password is base64-safe from openssl rand
printf 'DATABASE_URL=postgresql+psycopg://%s:%s@/%s?host=/cloudsql/%s\n' "$USER" "$PASS" "$DB" "$CONN"
