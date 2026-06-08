#!/usr/bin/env bash
# 1) Backup Cloud SQL → local dump file (read-only pg_dump via VM)
# 2) Apply Book62 portfolio alignment to Cloud SQL (active/inactive + org metadata)
#
# Usage (repo root):
#   ./scripts/backup-and-apply-book62-cloudsql.sh           # backup + dry-run alignment
#   ./scripts/backup-and-apply-book62-cloudsql.sh --apply   # backup + commit to Cloud SQL
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

STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${LOCAL_DUMP_DIR:-/Users/arjun/Software/tagged_data_sql}"
BACKUP_FILE="${BACKUP_DIR}/tgddata-cloudsql-pre-book62-${STAMP}.dump"
mkdir -p "$BACKUP_DIR"

echo "==> Step 1/3: Cloud SQL backup (read-only pg_dump via VM → local)"
echo "    Target copy: ${BACKUP_FILE}"
LOCAL_DUMP_DIR="${BACKUP_DIR}" ./scripts/pull-cloudsql-to-local.sh

LATEST="$(ls -t "${BACKUP_DIR}"/tgddata-cloudsql-*.dump 2>/dev/null | head -1)"
if [ -n "${LATEST}" ] && [ -f "${LATEST}" ]; then
  cp -f "${LATEST}" "${BACKUP_FILE}"
  echo "==> Backup saved: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"
else
  echo "WARNING: no dump file found under ${BACKUP_DIR}" >&2
fi

echo "==> Step 2/3: Book62 alignment on Cloud SQL via VM (private IP proxy)"
APPLY_ARGS=()
[ "${APPLY}" = 1 ] && APPLY_ARGS=(--apply)
"${REPO_ROOT}/scripts/apply-book62-via-vm.sh" "${APPLY_ARGS[@]}"

echo "==> Done. Backup: ${BACKUP_FILE}"
