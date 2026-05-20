#!/usr/bin/env sh
# Run Alembic migrations using DATABASE_URL from the environment or .env in repo root.
set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec alembic upgrade head
