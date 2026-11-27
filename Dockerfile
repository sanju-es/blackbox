# syntax=docker/dockerfile:1

# Build stage: type check and bundle the interface. Only the paths the build
# reads are copied, so a test, a document or a script has no path into the
# image even when it is built from the private project (`D-82`).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html token.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
RUN npm run build

# Runtime stage: the file service, the compiled interface and its production
# dependencies. No tests, documentation, example or local file is carried.
FROM node:24-alpine
LABEL org.opencontainers.image.title="blackbox" \
      org.opencontainers.image.description="Checks, metrics and configuration for the Prometheus blackbox exporter, with NTLM" \
      org.opencontainers.image.source="https://github.com/sanju-es/blackbox-public" \
      org.opencontainers.image.licenses="ISC"
ENV NODE_ENV=production \
    PORT=9115 \
    CONFIG_FILE=/config/blackbox.yml \
    STATIC_DIR=/app/dist
WORKDIR /app
RUN apk add --no-cache tini
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY LICENSE ./LICENSE
RUN mkdir -p /config && chown node:node /config
USER node
EXPOSE 9115
# `/` answers 200 in both mount modes and needs no token (D-82).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.ts"]
