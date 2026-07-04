#!/usr/bin/env bash
# Seed meal card sets and nutrition plan criteria on Cloud SQL (production).
# Idempotent — safe to re-run. Dry-run by default; pass --apply to write.
set -euo pipefail

APPLY=false
for arg in "$@"; do
  if [[ "$arg" == "--apply" ]]; then
    APPLY=true
  fi
done

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

echo "==> Run production seeds ${APPLY:+(--apply)}"

if [[ ! -x "${ROOT_DIR}/node_modules/.bin/tsx" ]]; then
  echo "Installing dependencies..."
  npm ci
fi

if command -v cloud-sql-proxy >/dev/null 2>&1; then
  PROXY_BIN="cloud-sql-proxy"
elif [[ -x "${ROOT_DIR}/.tmp/cloud-sql-proxy" ]]; then
  PROXY_BIN="${ROOT_DIR}/.tmp/cloud-sql-proxy"
else
  mkdir -p "${ROOT_DIR}/.tmp"
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PROXY_ARCH="darwin.arm64" ;;
    Darwin-x86_64) PROXY_ARCH="darwin.amd64" ;;
    Linux-x86_64) PROXY_ARCH="linux.amd64" ;;
    Linux-aarch64) PROXY_ARCH="linux.arm64" ;;
    *)
      echo "Unsupported platform for cloud-sql-proxy download."
      exit 1
      ;;
  esac
  PROXY_VERSION="v2.14.3"
  PROXY_URL="https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${PROXY_VERSION}/cloud-sql-proxy.${PROXY_ARCH}"
  curl -fsSL "$PROXY_URL" -o "${ROOT_DIR}/.tmp/cloud-sql-proxy"
  chmod +x "${ROOT_DIR}/.tmp/cloud-sql-proxy"
  PROXY_BIN="${ROOT_DIR}/.tmp/cloud-sql-proxy"
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
SEED_ARGS=()
if [[ "$APPLY" == "true" ]]; then
  SEED_ARGS=(--apply)
fi

cd "$ROOT_DIR/server"
echo "==> backfill-nutrition-plan-criteria"
npx tsx scripts/backfill-nutrition-plan-criteria.ts "${SEED_ARGS[@]}"
echo "==> seed-dinner-card-set"
npx tsx scripts/seed-dinner-card-set.ts "${SEED_ARGS[@]}"
echo "==> seed-meal-card-sets"
npx tsx scripts/seed-meal-card-sets.ts "${SEED_ARGS[@]}"

echo "==> Seeds complete"
