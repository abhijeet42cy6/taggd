#!/usr/bin/env sh
# Run ON the GCP VM (or via: gcloud compute ssh ... --command 'bash -s' < scripts/setup-cloud-sql-proxy-vm.sh)
# Installs Cloud SQL Auth Proxy and a systemd unit for tgddata-pg-prod.
set -e

CONNECTION_NAME="${CLOUDSQL_CONNECTION_NAME:-taggd-491107:asia-south1:tgddata-pg-prod}"
PROXY_VERSION="${CLOUDSQL_PROXY_VERSION:-2.14.3}"
INSTALL_DIR="${CLOUDSQL_PROXY_INSTALL_DIR:-/usr/local/bin}"
SOCKET_DIR="${CLOUDSQL_SOCKET_DIR:-/cloudsql}"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

curl -fsSL -o "${INSTALL_DIR}/cloud-sql-proxy" \
  "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v${PROXY_VERSION}/cloud-sql-proxy.linux.${ARCH}"
chmod +x "${INSTALL_DIR}/cloud-sql-proxy"
mkdir -p "${SOCKET_DIR}"

cat > /etc/systemd/system/cloud-sql-proxy-tgddata.service <<EOF
[Unit]
Description=Cloud SQL Auth Proxy (tgddata-pg-prod)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/cloud-sql-proxy --unix-socket ${SOCKET_DIR} ${CONNECTION_NAME}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cloud-sql-proxy-tgddata.service
systemctl status cloud-sql-proxy-tgddata.service --no-pager || true
echo "Proxy listening on unix socket under ${SOCKET_DIR}/${CONNECTION_NAME}"
echo ""
echo "Deploy app with host proxy:"
echo "  docker compose -f docker-compose.prod.host-proxy.yml up -d --build"
echo "Or use compose-managed proxy instead:"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
