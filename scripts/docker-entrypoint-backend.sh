#!/usr/bin/env sh
set -e
cd /app
echo "==> Running Alembic migrations..."
alembic upgrade head
echo "==> Starting API..."
PORT="${PORT:-8080}"
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT}"
