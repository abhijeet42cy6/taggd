#!/usr/bin/env bash
# Promote a local SQLite file to the production VM (replaces /app/db_data/revenue_generator.db).
#
# Why this instead of bundling in deploy.tar?
# - Upload only the DB when the data changes (faster than baking it into every deploy).
# - Clear stop → copy → start sequence (safe for SQLite).
# - Optional gzip shrinks transfer over IAP.
#
# Prereqs: gcloud auth, same defaults as deploy-gcp.sh (GCP_PROJECT, etc.).
#
# Usage:
#   ./scripts/promote-db-to-gcp.sh [path/to/revenue_generator.db]
#   LOCAL_DB=./db_data/revenue_generator.db ./scripts/promote-db-to-gcp.sh
#
# Before running locally:
#   - Use a DB built with the same (or older) schema as the code you just deployed.
#   - Keep JWT_SECRET in VM .env stable if you want existing tokens to keep working.
#   - Stop local backend / close DB viewers so the file is not locked.
#   - If you see .db-wal / .db-shm next to the file, run: sqlite3 your.db "PRAGMA wal_checkpoint(TRUNCATE);"
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
GCP_INSTANCE="${GCP_INSTANCE:-revenue-gen-prod}"
REMOTE_USER="${REMOTE_USER:-arjun}"
CONTAINER="${CONTAINER:-tgddata_c1_backend_1}"

LOCAL_DB="${1:-${LOCAL_DB:-${REPO_ROOT}/revenue_generator.db}}"

if [[ ! -f "$LOCAL_DB" ]]; then
  echo "ERROR: File not found: $LOCAL_DB" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d%H%M%S)
TMP_BASE="revenue_generator-${STAMP}.db.gz"
REMOTE_GZ="~/${TMP_BASE}"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet

echo "==> Compressing: $LOCAL_DB"
gzip -c "$LOCAL_DB" > "/tmp/${TMP_BASE}"

echo "==> Uploading to ${GCP_INSTANCE} (~$(du -h "/tmp/${TMP_BASE}" | cut -f1))..."
gcloud compute scp "/tmp/${TMP_BASE}" "${REMOTE_USER}@${GCP_INSTANCE}:~/${TMP_BASE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap

echo "==> Stopping ${CONTAINER}, backup old DB, install new DB, start (remote)..."
# shellcheck disable=SC2029
gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="
set -euo pipefail
GZF=\$HOME/${TMP_BASE}
RDB=/tmp/revenue_generator.promote-${STAMP}.db
test -f \"\$GZF\"
gunzip -c \"\$GZF\" > \"\$RDB\"
if ! docker ps -a --format '{{.Names}}' | grep -q '^${CONTAINER}\$'; then
  echo \"ERROR: Container ${CONTAINER} not found. Deploy app first.\" >&2
  exit 1
fi
echo 'Stopping backend...'
docker stop ${CONTAINER} 2>/dev/null || true
# Backup current file from container (best-effort)
BAK=~/revenue_generator.db.bak-\$(date +%Y%m%d%H%M%S)
if docker cp ${CONTAINER}:/app/db_data/revenue_generator.db \"\$BAK\" 2>/dev/null; then
  echo \"Backup saved: \$BAK\"
else
  echo \"(No previous DB in container, or first promote — skipping backup copy)\"
fi
docker cp \"\$RDB\" ${CONTAINER}:/app/db_data/revenue_generator.db
rm -f \"\$RDB\" \"\$GZF\"
echo 'Starting backend...'
docker start ${CONTAINER}
echo '==> DB promote finished.'
"

rm -f "/tmp/${TMP_BASE}"
echo "Done. Verify: curl -sS https://<your-tunnel-or-ip>/api/  (or open the app)."
