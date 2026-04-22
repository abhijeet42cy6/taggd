#!/usr/bin/env bash
# Deploy this repo to a GCE VM using Google Cloud CLI.
# Full procedure, verification, and troubleshooting: see DEPLOYMENT_DOC.md (§5).
# Default project: taggd-491107 (override with GCP_PROJECT).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── GCP (taggd org production project) ─────────────────────────────────────
GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
GCP_INSTANCE="${GCP_INSTANCE:-revenue-gen-prod}"
REMOTE_USER="${REMOTE_USER:-arjun}"
REMOTE_DIR="${REMOTE_DIR:-tgddata_C1}"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet

TAR_PATH="${TAR_PATH:-/tmp/tgddata-deploy-${GCP_PROJECT}.tar.gz}"

echo "==> Project: ${GCP_PROJECT}  VM: ${GCP_INSTANCE}  Zone: ${GCP_ZONE}"

echo "==> Creating archive: ${TAR_PATH}"
tar -czf "${TAR_PATH}" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.venv' \
  --exclude='venv' \
  --exclude='excel_files' \
  --exclude='revenue_generator.db' \
  --exclude='*.tar.gz' \
  backend frontend excel_files_imp scripts \
  Dockerfile.backend Dockerfile.frontend \
  docker-compose.yml nginx.conf requirements.txt .env.example

echo "==> Uploading bundle..."
gcloud compute scp "${TAR_PATH}" "${REMOTE_USER}@${GCP_INSTANCE}:~/deploy.tar.gz" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap

if [[ -f "${REPO_ROOT}/.env" ]]; then
  echo "==> Uploading .env (from local repo root)..."
  gcloud compute scp "${REPO_ROOT}/.env" "${REMOTE_USER}@${GCP_INSTANCE}:~/tgddata.env" \
    --zone="${GCP_ZONE}" \
    --project="${GCP_PROJECT}" \
    --tunnel-through-iap
else
  echo "==> No local .env found — ensure ~/tgddata_C1/.env exists on the VM or upload secrets separately."
fi

echo "==> Extracting and restarting containers on VM..."
gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="
set -e
# Legacy stack from older deploys binds host :80; remove so the new frontend can start.
docker rm -f deploy_frontend_1 deploy_backend_1 2>/dev/null || true
rm -rf ~/${REMOTE_DIR}
mkdir -p ~/${REMOTE_DIR}
tar -xzf ~/deploy.tar.gz -C ~/${REMOTE_DIR}
if [ -f ~/tgddata.env ]; then mv -f ~/tgddata.env ~/${REMOTE_DIR}/.env; fi
cd ~/${REMOTE_DIR}
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build
elif docker compose version >/dev/null 2>&1; then
  docker compose up -d --build
else
  echo 'ERROR: Neither docker-compose nor docker compose found on VM.' >&2
  exit 1
fi
echo 'Done.'
"

echo "==> Deploy finished."
