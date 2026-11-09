# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24
ARG ALPINE_VERSION=3.22
ARG PB_VERSION=0.40.5

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# PocketBase release download
# ---------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS pb-download
ARG PB_VERSION
ARG TARGETARCH
ARG PB_SHA256=""

RUN apk add --no-cache ca-certificates wget unzip
RUN wget -q -O /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && if [ -n "${PB_SHA256}" ]; then \
      echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c -; \
    fi \
 && unzip /tmp/pb.zip -d /pb \
 && rm /tmp/pb.zip

# ---------------------------------------------------------------------------
# PocketBase runtime (non-root)
# ---------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS pocketbase
RUN apk add --no-cache ca-certificates tzdata wget \
 && addgroup -S -g 10001 itsm \
 && adduser -S -u 10001 -G itsm -h /pb itsm

WORKDIR /pb
COPY --from=pb-download /pb/pocketbase /usr/local/bin/pocketbase
COPY backend/pb_migrations ./pb_migrations
COPY backend/pb_hooks ./pb_hooks
# Zona IANA dibundel agar hasil SLA tidak bergantung pada paket tzdata sistem.
# `ZONEINFO` dibaca Go saat memuat lokasi; nilainya harus ada sejak proses lahir.
COPY backend/zoneinfo.zip ./zoneinfo.zip
ENV ZONEINFO=/pb/zoneinfo.zip
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /pb/pb_data \
 && chown -R itsm:itsm /pb

USER 10001:10001
EXPOSE 8090
VOLUME ["/pb/pb_data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# ---------------------------------------------------------------------------
# Caddy web runtime (non-root, high ports)
# ---------------------------------------------------------------------------
FROM caddy:2.10-alpine AS web
RUN apk add --no-cache curl libcap \
 && setcap -r /usr/bin/caddy \
 && addgroup -S -g 10002 web \
 && adduser -S -u 10002 -G web web

COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /app/frontend/dist /srv

RUN mkdir -p /data /config \
 && chown -R web:web /srv /data /config

USER 10002:10002
EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -kfsS --resolve "${APP_DOMAIN}:8443:127.0.0.1" "https://${APP_DOMAIN}:8443/healthz" || exit 1

# ---------------------------------------------------------------------------
# Backup sidecar (non-root)
# ---------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS backup
RUN apk add --no-cache tzdata \
 && addgroup -S -g 10001 itsm \
 && adduser -S -u 10001 -G itsm itsm

COPY docker/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

USER 10001:10001
ENTRYPOINT ["/usr/local/bin/backup.sh"]
