#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  if [ "${DEPLOY_TARGET:-}" = "staging" ]; then
    sh ./staging-database-url-guard.sh
  fi
  ./node_modules/.bin/prisma migrate deploy
fi

exec node dist/src/index.js
