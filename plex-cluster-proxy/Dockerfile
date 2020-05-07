FROM nginx:alpine
# For debugging
#FROM firesh/nginx-lua:alpine
RUN \
    mkdir -p /data &&\
    touch /var/log/nginx/plex.log &&\
    chown nginx:nginx /data /var/log/nginx/plex.log &&\
    apk --no-cache add openssl curl bash
COPY ./config/nginx.conf /etc/nginx/nginx.conf.template
COPY ./src /
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]