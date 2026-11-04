#!/bin/sh
set -eu
cd /opt/fiestapay
docker exec fiestapay-api-1 node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
config=/root/nginx-core/conf.d/fiestapay.conf
backup=/opt/fiestapay/backups/fiestapay-nginx-$(date -u +%Y%m%dT%H%M%SZ).conf
mkdir -p /opt/fiestapay/backups
cp "$config" "$backup"
cert=/opt/fiestapay/certbot/conf/live/fiestapay.somospanas.com
install -m 644 "$cert/fullchain.pem" /root/nginx-core/certs/fiestapay-fullchain.pem
install -m 600 "$cert/privkey.pem" /root/nginx-core/certs/fiestapay-privkey.pem
cp deploy/nginx.conf "$config"
if ! docker exec web-proxy-core nginx -t; then
  cp "$backup" "$config"
  echo 'FiestaPay configuration restored; proxy was not reloaded.' >&2
  exit 1
fi
docker exec web-proxy-core nginx -s reload
echo 'FiestaPay virtual host activated.'
