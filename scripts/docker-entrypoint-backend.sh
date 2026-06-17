#!/usr/bin/env sh
set -e
cd /app

MAX_WAIT=120
WAITED=0
until python3 -c "
import os, sys
url = os.environ.get('DATABASE_URL', '')
if 'postgresql' in url:
    url = url.replace('postgresql+psycopg://', 'postgresql://', 1)
    import psycopg
    try:
        psycopg.connect(url, connect_timeout=5).close()
        sys.exit(0)
    except Exception:
        sys.exit(1)
sys.exit(0)
" 2>/dev/null; do
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo "DB not ready after ${MAX_WAIT}s"
        exit 1
    fi
    echo "Waiting for database... (${WAITED}s)"
    sleep 3
    WAITED=$((WAITED + 3))
done

echo "==> Running Alembic migrations..."
alembic upgrade head
echo "==> Starting API..."
PORT="${PORT:-8080}"
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT}"
