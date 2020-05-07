#!/usr/bin/env bash

sleep 5;
while [ -z "$(pgrep nginx)" ]; do
    echo "Waiting for nginx...";
    sleep 5;
done;

tail -f /var/log/nginx/plex.log | while read -r LINE; do
    curl -s -X POST -H 'Content-Type: application/json' ${CLUSTER_MANAGER}?token=${CLUSTER_MANAGER_TOKEN} -d "${LINE}" > /dev/null;
done
