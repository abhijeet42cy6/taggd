#!/usr/bin/env bash
# Create tgddata-c1-prod-2: n2-standard-4, 100GB pd-balanced, Ubuntu 22.04, asia-south1-a
# Run from your machine:  gcloud auth login   then   ./scripts/create-tgddata-vm.sh
set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-taggd-491107}"
GCP_ZONE="${GCP_ZONE:-asia-south1-a}"
VM_NAME="${VM_NAME:-tgddata-c1-prod-2}"
MACHINE_TYPE="${MACHINE_TYPE:-n2-standard-4}"
BOOT_DISK_GB="${BOOT_DISK_GB:-100}"
REF_INSTANCE="${REF_INSTANCE:-revenue-gen-prod}"

export CLOUDSDK_CORE_PROJECT="$GCP_PROJECT"
gcloud config set project "$GCP_PROJECT" --quiet

EXTRA=()
if gcloud compute instances describe "$REF_INSTANCE" --zone="$GCP_ZONE" --project="$GCP_PROJECT" &>/dev/null; then
  SUBN=$(gcloud compute instances describe "$REF_INSTANCE" --zone="$GCP_ZONE" --format='value(networkInterfaces[0].subnetwork)' 2>/dev/null || true)
  if [[ -n "${SUBN:-}" ]]; then
    # Use same subnet as existing prod (custom VPC)
    EXTRA=(--subnet="$SUBN")
    echo "==> Using subnet from ${REF_INSTANCE}: $SUBN"
  fi
else
  echo "==> Reference instance ${REF_INSTANCE} not found; using default network"
fi

echo "==> Creating ${VM_NAME} (${MACHINE_TYPE}, ${BOOT_DISK_GB}GB pd-balanced) in ${GCP_ZONE}..."

gcloud compute instances create "$VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --boot-disk-size="${BOOT_DISK_GB}GB" \
  --boot-disk-type=pd-balanced \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server \
  --metadata=block-project-ssh-keys=false \
  "${EXTRA[@]}"

echo "==> Done."
gcloud compute instances describe "$VM_NAME" --zone="$GCP_ZONE" --format='table(name,status,machineType,zone,networkInterfaces[0].accessConfigs[0].natIP)'
