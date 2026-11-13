#!/bin/sh
# Refuse a staging process whose DATABASE_URL could reach production.
# No-op unless DEPLOY_TARGET=staging. Safe to run before Prisma migrations.
set -eu

if [ "${DEPLOY_TARGET:-}" != "staging" ]; then
  exit 0
fi

url="${DATABASE_URL:-}"
if [ -z "$url" ]; then
  echo "Refusing to start: staging DATABASE_URL is empty." >&2
  exit 1
fi

case "$url" in
  *metabolic-v1*)
    echo "Refusing to start: staging DATABASE_URL contains metabolic-v1." >&2
    exit 1
    ;;
esac

case "$url" in
  *metabolic-staging:us-central1:metabolic-db*)
    ;;
  *)
    echo "Refusing to start: staging DATABASE_URL must use Cloud SQL connection metabolic-staging:us-central1:metabolic-db." >&2
    exit 1
    ;;
esac
