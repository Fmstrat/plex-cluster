FROM node:alpine
COPY --chown=node:node src /app
WORKDIR /app
RUN mkdir /data && chown node:node /data
USER node
RUN npm install
CMD npm run prod
