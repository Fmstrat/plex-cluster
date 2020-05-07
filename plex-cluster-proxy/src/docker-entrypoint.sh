#!/usr/bin/env sh

set -eu

if [ ! -f /data/dhparam.pem ]; then
    openssl dhparam -out /data/dhparam.pem 2048
fi;

envsubst '${PLEX_IP} ${PLEX_PORT} ${HTTPS_HOST} ${HTTPS_PORT} ${RESOLVERS} ${SSL_CERTIFICATE} ${SSL_CERTIFICATE_KEY}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

#nginx -g "daemon off;" &

/delivery.sh &

exec "$@"