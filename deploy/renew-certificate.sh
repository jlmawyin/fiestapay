#!/bin/sh
set -eu
docker run --rm -v /opt/fiestapay/certbot/conf:/etc/letsencrypt -v /root/nginx-core/certs/fiestapay-acme:/var/www/html certbot/certbot renew --cert-name fiestapay.somospanas.com --quiet
cert=/opt/fiestapay/certbot/conf/live/fiestapay.somospanas.com
install -m 644 "$cert/fullchain.pem" /root/nginx-core/certs/fiestapay-fullchain.pem
install -m 600 "$cert/privkey.pem" /root/nginx-core/certs/fiestapay-privkey.pem
docker exec web-proxy-core nginx -t
docker exec web-proxy-core nginx -s reload
