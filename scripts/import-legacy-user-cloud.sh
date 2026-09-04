#!/usr/bin/env bash
# Import one legacy astermet user into Cloud SQL (production).
# Dry-run by default; pass --apply to write. Extra flags are forwarded
# (e.g. --email grobrien@gmail.com --force --auth-only).
set -euo pipefail

APPLY=false
FORWARD_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--apply" ]]; then
    APPLY=true
  fi
  FORWARD_ARGS+=("$arg")
done

if [[ ${#FORWARD_ARGS[@]} -eq 0 ]]; then
  echo "Usage: scripts/import-legacy-user-cloud.sh --email user@example.com [--apply]"
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
REGION="${REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-metabolic-db}"
CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
SOCKET_DIR="${CLOUDSQL_SOCKET_DIR:-/tmp/cloudsql}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROXY_LOG="${ROOT_DIR}/.tmp/cloud-sql-proxy.log"
SOCKET_FILE="${SOCKET_DIR}/${CONNECTION}/.s.PGSQL.5432"

fail_with_proxy_logs() {
  echo "$1"
  if [[ -f "$PROXY_LOG" ]]; then
    echo "Cloud SQL proxy logs:"
    cat "$PROXY_LOG"
  fi
  exit 1
}

if [[ "$APPLY" == "true" ]]; then
  echo "==> Import legacy user to production (--apply)"
else
  echo "==> Import legacy user to production (dry-run)"
fi

if command -v cloud-sql-proxy >/dev/null 2>&1; then
  PROXY_BIN="cloud-sql-proxy"
elif [[ -x "${ROOT_DIR}/.tmp/cloud-sql-proxy" ]]; then
  PROXY_BIN="${ROOT_DIR}/.tmp/cloud-sql-proxy"
else
  echo "cloud-sql-proxy is required."
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

print(
    urllib.parse.urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment)
    )
)
PY
)"

mkdir -p "$SOCKET_DIR" "${ROOT_DIR}/.tmp"

echo "==> Start Cloud SQL Auth Proxy (unix socket: ${SOCKET_DIR})"
"$PROXY_BIN" "$CONNECTION" --unix-socket "$SOCKET_DIR" --gcloud-auth >"$PROXY_LOG" 2>&1 &
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
export MIGRATION_IDMAP_PATH="${ROOT_DIR}/.tmp/migration-idmap-production.json"
export LEGACY_DUMP_PATH="${LEGACY_DUMP_PATH:-/Users/derekfowler/Downloads/astermet_app.sql}"

cd "$ROOT_DIR/server"
# Do not pass --env-file=.env — that would replace Cloud SQL DATABASE_URL with local.
npx tsx scripts/migration/import-one-legacy-user.ts "${FORWARD_ARGS[@]}"
