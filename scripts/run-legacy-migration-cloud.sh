#!/usr/bin/env bash
# Run legacy astermet_app.sql ETL against Cloud SQL (production).
# Requires: gcloud auth, cloud-sql-proxy, legacy dump at LEGACY_DUMP_PATH.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
REGION="${REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-metabolic-db}"
CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
SOCKET_DIR="${CLOUDSQL_SOCKET_DIR:-/tmp/cloudsql-legacy-migration}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROXY_LOG="${ROOT_DIR}/.tmp/cloud-sql-proxy-legacy.log"
SOCKET_FILE="${SOCKET_DIR}/${CONNECTION}/.s.PGSQL.5432"
LEGACY_DUMP_PATH="${LEGACY_DUMP_PATH:-/Users/derekfowler/repo/mmv1/mmv1/astermet_app.sql}"
IDMAP_PATH="${ROOT_DIR}/server/.tmp/migration-idmap-prod.json"
REPORT_PATH="${ROOT_DIR}/server/.tmp/migration-report-prod.md"
SKIP_FIREBASE="${SKIP_FIREBASE:-0}"

fail_with_proxy_logs() {
  echo "$1"
  if [[ -f "$PROXY_LOG" ]]; then
    echo "Cloud SQL proxy logs:"
    cat "$PROXY_LOG"
  fi
  exit 1
}

if [[ ! -f "$LEGACY_DUMP_PATH" ]]; then
  echo "Legacy dump not found: $LEGACY_DUMP_PATH"
  echo "Set LEGACY_DUMP_PATH to astermet_app.sql"
  exit 1
fi

if command -v cloud-sql-proxy >/dev/null 2>&1; then
  PROXY_BIN="cloud-sql-proxy"
elif [[ -x "${ROOT_DIR}/.tmp/cloud-sql-proxy" ]]; then
  PROXY_BIN="${ROOT_DIR}/.tmp/cloud-sql-proxy"
else
  echo "cloud-sql-proxy not found. Install it or run scripts/run-cloud-migrations.sh once to download."
  exit 1
fi

RAW_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project="$PROJECT_ID")"

MIGRATION_URL="$(
  RAW_DATABASE_URL="$RAW_URL" SOCKET_DIR="$SOCKET_DIR" CONNECTION="$CONNECTION" python3 <<'PY'
import os
import urllib.parse

raw = os.environ["RAW_DATABASE_URL"]
socket_dir = os.environ["SOCKET_DIR"]
connection = os.environ["CONNECTION"]
parsed = urllib.parse.urlparse(raw)
query = urllib.parse.parse_qs(parsed.query)
query["host"] = [f"{socket_dir}/{connection}"]
new_query = urllib.parse.urlencode(query, doseq=True)
print(urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment)))
PY
)"

mkdir -p "$SOCKET_DIR" "${ROOT_DIR}/.tmp" "${ROOT_DIR}/server/.tmp"

echo "==> Start Cloud SQL Auth Proxy"
"$PROXY_BIN" "$CONNECTION" --unix-socket "$SOCKET_DIR" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT

proxy_ready=false
for _ in $(seq 1 60); do
  if [[ -S "$SOCKET_FILE" ]]; then
    proxy_ready=true
    break
  fi
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    fail_with_proxy_logs "Cloud SQL proxy exited before the socket was ready."
  fi
  sleep 1
done

if [[ "$proxy_ready" != "true" ]]; then
  fail_with_proxy_logs "Cloud SQL proxy did not create ${SOCKET_FILE}."
fi

export DATABASE_URL="$MIGRATION_URL"
export LEGACY_DUMP_PATH
export MIGRATION_IDMAP_PATH="$IDMAP_PATH"

echo "==> Target database: Cloud SQL (${CONNECTION})"

echo "==> Apply Prisma migrations to Cloud SQL"
(cd server && DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy)

run_phase() {
  (cd server && DATABASE_URL="$MIGRATION_URL" LEGACY_DUMP_PATH="$LEGACY_DUMP_PATH" MIGRATION_IDMAP_PATH="$IDMAP_PATH" "$@")
}

echo "==> Phase 1: libraries + templates"
run_phase npx tsx scripts/migration/01-libraries.ts

echo "==> Phase 2: users + coaches (+ Firebase when SKIP_FIREBASE=0)"
if [[ "$SKIP_FIREBASE" == "1" ]]; then
  run_phase env SKIP_FIREBASE=1 npx tsx scripts/migration/02-users.ts
else
  run_phase npx tsx scripts/migration/02-users.ts
fi

echo "==> Phase 3: body-composition progress history"
run_phase npx tsx scripts/migration/03-progress.ts

echo "==> Phase 4: validate + report"
run_phase npx tsx scripts/migration/validate-and-report.ts

echo ""
echo "Done. Production migration complete."
echo "  Id map:  $IDMAP_PATH"
echo "  Report:  $REPORT_PATH (if validate script wrote it — check server/.tmp/migration-report.md path)"
echo "  Firebase: $([ "$SKIP_FIREBASE" = "1" ] && echo SKIPPED || echo imported)"
