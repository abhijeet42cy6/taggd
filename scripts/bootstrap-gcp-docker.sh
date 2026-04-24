#!/usr/bin/env bash
# One-time: install Docker Engine + Compose plugin on a fresh GCE Ubuntu VM.
# After this, log out and back in (or reboot) so your user is in the `docker` group;
# then deploy and DB promote work without sudo.
#
# Usage:
#   GCP_INSTANCE=tgddata-c1-prod-2 ./scripts/bootstrap-gcp-docker.sh
#
set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
GCP_INSTANCE="${GCP_INSTANCE:-tgddata-c1-prod-2}"
REMOTE_USER="${REMOTE_USER:-arjun}"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet

echo "==> Installing Docker on ${GCP_INSTANCE} (${GCP_ZONE})..."

gcloud compute ssh "${REMOTE_USER}@${GCP_INSTANCE}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT}" \
  --tunnel-through-iap \
  --command="
set -euo pipefail
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo 'Docker already running.'
  docker --version
  exit 0
fi
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ${REMOTE_USER} || true
echo '==> Docker installed. Verifying with sudo...'
sudo docker run --rm hello-world
echo \"==> Done. Reboot so user can use docker without sudo: sudo reboot\"
"
