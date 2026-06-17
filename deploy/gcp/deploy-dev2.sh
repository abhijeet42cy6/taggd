#!/usr/bin/env sh
# Full dev2 deploy: Cloud SQL instance → API → frontend (isolated from prod/dev).
set -e
DIR="$(dirname "$0")"

echo "==> [dev2] Setting up Cloud SQL instance + database..."
sh "${DIR}/05-setup-db-dev2.sh"

echo "==> [dev2] Building and deploying API (tgddata-api-dev2)..."
sh "${DIR}/06-deploy-api-dev2.sh"

echo "==> [dev2] Building and deploying frontend..."
sh "${DIR}/07-deploy-frontend-dev2.sh"

echo ""
echo "Done. dev2 endpoints:"
if [ -f "${DIR}/.generated/api-url-dev2.txt" ]; then
  printf '  API: %s\n' "$(cat "${DIR}/.generated/api-url-dev2.txt")"
fi
if [ -f "${DIR}/.generated/web-url-dev2.txt" ]; then
  printf '  Web: %s\n' "$(cat "${DIR}/.generated/web-url-dev2.txt")"
fi
echo ""
echo "Login: admin@test.local / AUTH_BOOTSTRAP_PASSWORD from .env (default test1234)"
