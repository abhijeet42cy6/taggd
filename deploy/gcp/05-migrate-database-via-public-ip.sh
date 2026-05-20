#!/usr/bin/env sh
# One-time SQLite → Cloud SQL migration when the instance is private-IP-only.
#
# Temporarily enables a public IPv4 on tgddata-pg-prod so cloud-sql-proxy on your
# laptop can connect (no VM bastion). Public IP is removed again on exit unless it
# was already enabled before this script ran.
#
# See deploy/gcp/README.md § "SQLite data migration (temporary public IP)".
set -e
# shellcheck disable=SC1091
. "$(dirname "$0")/lib.sh"

_DIR="$(dirname "$0")"

_instance_has_public_ip() {
  [ "$(gcloud sql instances describe "${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --format='value(settings.ipConfiguration.ipv4Enabled)' 2>/dev/null)" = True ]
}

_wait_sql_operation() {
  _op="$(gcloud sql operations list \
    --instance="${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --limit=1 \
    --format='value(name)')"
  [ -n "${_op}" ] || return 0
  log "Waiting for Cloud SQL operation ${_op}"
  gcloud sql operations wait "${_op}" --project="${GCP_PROJECT}" --timeout=1200
}

_we_enabled_public=0

_disable_public_if_we_enabled() {
  if [ "${_we_enabled_public}" != 1 ]; then
    return 0
  fi
  log "Removing temporary public IPv4 from ${CLOUDSQL_INSTANCE}"
  gcloud sql instances patch "${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --no-assign-ip \
    --quiet
  _wait_sql_operation
  log "Instance is private-IP-only again (Cloud Run still uses VPC connector + private IP)"
}

trap '_disable_public_if_we_enabled' EXIT INT TERM

if _instance_has_public_ip; then
  log "Public IPv4 already present on ${CLOUDSQL_INSTANCE} — will leave it unchanged after migration"
else
  log "Enabling temporary public IPv4 on ${CLOUDSQL_INSTANCE} (for local Auth Proxy only)"
  gcloud sql instances patch "${CLOUDSQL_INSTANCE}" \
    --project="${GCP_PROJECT}" \
    --assign-ip \
    --quiet
  _wait_sql_operation
  _we_enabled_public=1
  log "Public IP enabled. Auth Proxy uses Google's tunnel; do not add 0.0.0.0/0 authorized networks."
  log "Waiting 90s for instance networking to settle after patch"
  sleep 90
fi

export CLOUDSQL_PROXY_PRIVATE_IP=0
sh "${_DIR}/05-migrate-database.sh"

log "Migration finished; cleaning up public IP if this script enabled it"
