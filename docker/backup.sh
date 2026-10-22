#!/bin/sh
set -eu

mkdir -p /backups

while true; do
  if [ -d /pb_data/backups ]; then
    find /pb_data/backups -maxdepth 1 -type f -name '*.zip' \
      -exec cp -p {} /backups/ \;
  fi

  find /backups -maxdepth 1 -type f -name '*.zip' -mtime +30 \
    -exec rm -f {} \;

  sleep 3600
done
