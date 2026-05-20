#!/usr/bin/env bash
# Run on the VM (with sudo) after docker compose is up with frontend on 127.0.0.1:8080:80.
# Idempotent: skips overwriting site config once Let's Encrypt cert exists.
set -euo pipefail

DOMAIN="${TGDDATA_TLS_DOMAIN:-taggd.aparatus.in}"
EMAIL="${TGDDATA_TLS_EMAIL:-arjun@aocr.in}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/host-nginx-${DOMAIN}.conf"
SITE_NAME="${DOMAIN}"
SITE_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "Missing template: ${TEMPLATE}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y nginx python3-certbot python3-certbot-nginx

if [[ ! -f "${LE_CERT}" ]]; then
  install -m 0644 "${TEMPLATE}" "${SITE_AVAILABLE}"
  ln -sf "${SITE_AVAILABLE}" "${SITE_ENABLED}"
  nginx -t
  systemctl reload nginx

  certbot --nginx \
    -d "${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive
else
  echo "Certificate already present at ${LE_CERT}; skipping template copy and certbot issue."
  ln -sf "${SITE_AVAILABLE}" "${SITE_ENABLED}" 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  certbot renew --quiet --no-random-sleep-on-renew 2>/dev/null || true
fi

systemctl enable --quiet nginx
echo "Host TLS / Nginx ready for https://${DOMAIN}/"
