#!/usr/bin/env bash
# Apply Book62 portfolio alignment to Cloud SQL via VM IAP + private-IP Auth Proxy.
# Prereqs: gcloud auth login, IAP SSH to tgddata-c1-prod-2.
#
# Usage (repo root):
#   ./scripts/apply-book62-via-vm.sh           # dry-run on Cloud SQL
#   ./scripts/apply-book62-via-vm.sh --apply   # commit changes
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help)
      echo "Usage: $0 [--apply]"
      exit 0
      ;;
  esac
done

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-env-tgddata-c1-prod-2.sh"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/gcp-cloudsql-tgddata-pg-prod.sh"

REMOTE_USER="${REMOTE_USER:-arjun}"
PROXY_PORT="${CLOUDSQL_PROXY_PORT:-9471}"
STAMP="$(date +%Y%m%d%H%M%S)"
REMOTE_DIR="book62-apply-${STAMP}"
TARBALL="/tmp/${REMOTE_DIR}.tgz"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet >/dev/null

_db_pass="$(gcloud secrets versions access latest \
  --secret="${CLOUDSQL_SECRET_PASSWORD}" \
  --project="${GCP_PROJECT}")" || {
  echo "ERROR: Cannot read secret. Run: gcloud auth login" >&2
  exit 1
}

_gcloud_token="$(gcloud auth print-access-token --project="${GCP_PROJECT}")" || {
  echo "ERROR: gcloud auth print-access-token failed. Run: gcloud auth login" >&2
  exit 1
}

echo "==> Packaging apply bundle"
tar czf "${TARBALL}" \
  backend/scripts/apply_book62_portfolio_alignment.py \
  backend/db \
  excel_files_imp/Book62.xlsx

echo "==> Uploading to ${GCP_INSTANCE}"
gcloud compute scp "${TARBALL}" "${REMOTE_USER}@${GCP_INSTANCE}:~/${REMOTE_DIR}.tgz" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap

APPLY_FLAG=""
[ "${APPLY}" = 1 ] && APPLY_FLAG="--apply"

echo "==> Book62 alignment on Cloud SQL ($([ "${APPLY}" = 1 ] && echo APPLY || echo DRY-RUN))"
gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="
set -euo pipefail
WORKDIR=\$HOME/${REMOTE_DIR}
mkdir -p \"\$WORKDIR\"
tar xzf \$HOME/${REMOTE_DIR}.tgz -C \"\$WORKDIR\"
test -f \"\$WORKDIR/backend/scripts/apply_book62_portfolio_alignment.py\"

CONN='${CLOUDSQL_CONNECTION_NAME}'
USER='${CLOUDSQL_USER}'
DB='${CLOUDSQL_DATABASE}'
PORT=${PROXY_PORT}
PROXY=/tmp/cloud-sql-proxy-book62-apply
PASS='$(python3 -c "import shlex; print(shlex.quote('''${_db_pass}'''))")'
GCLOUD_TOKEN='$(python3 -c "import shlex; print(shlex.quote('''${_gcloud_token}'''))")'
fuser -k \"\$PORT\"/tcp 2>/dev/null || true
pkill -f \"cloud-sql-proxy.*\$PORT\" 2>/dev/null || true
sleep 1
if [ ! -x \"\$PROXY\" ]; then
  curl -fsSL -o \"\$PROXY\" https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64
  chmod +x \"\$PROXY\"
fi
echo '==> Auth Proxy (private IP) on 127.0.0.1:'\"\$PORT\"
\"\$PROXY\" \"\$CONN\" --port \"\$PORT\" --private-ip --token=\"\$GCLOUD_TOKEN\" &
PROXY_PID=\$!
trap 'kill \"\$PROXY_PID\" 2>/dev/null || true' EXIT
sleep 5

export DATABASE_URL=\"postgresql+psycopg://\${USER}:\${PASS}@127.0.0.1:\${PORT}/\${DB}\"
export PYTHONPATH=\"\$WORKDIR\"

docker run --rm --network host \
  -v \"\$WORKDIR:\$WORKDIR:ro\" \
  -e DATABASE_URL \
  -e PYTHONPATH \
  -w \"\$WORKDIR\" \
  python:3.12-slim-bookworm \
  bash -c '
    pip install -q sqlalchemy 'psycopg[binary]' openpyxl &&
    python3 backend/scripts/apply_book62_portfolio_alignment.py ${APPLY_FLAG}
  '
rm -rf \"\$WORKDIR\" \$HOME/${REMOTE_DIR}.tgz
"

rm -f "${TARBALL}"

echo "==> Post-check /ready (Cloud Run)"
curl -sS "https://tgddata-api-lnucyjw2sa-el.a.run.app/ready" || true
echo ""
echo "==> Done."
