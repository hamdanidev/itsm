#!/bin/sh
set -eu

exec /usr/local/bin/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks \
  --automigrate="${AUTOMIGRATE:-false}" \
  --origins="${APP_ORIGIN:-http://localhost:8080}" \
  "$@"
