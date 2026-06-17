#!/usr/bin/env bash
# Open psql against the local Docker Postgres stack.
# Prereq: ./scripts/start-dev-local.sh (postgres container running).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -f "${REPO_ROOT}/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "${REPO_ROOT}/.env"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-tgddata}"
POSTGRES_DB="${POSTGRES_DB:-tgddata}"

exec docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
