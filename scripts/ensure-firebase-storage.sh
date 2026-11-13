#!/usr/bin/env bash
# Ensure Firebase Storage default bucket exists for rules deploy.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
LOCATION="${FIREBASE_STORAGE_LOCATION:-us-central1}"
if [[ "${DEPLOY_TARGET:-}" == "staging" ]]; then
  # shellcheck disable=SC1091
  source "$(cd "$(dirname "$0")" && pwd)/assert-deploy-target.sh"
  assert_deploy_target
fi
API_BASE="https://firebasestorage.googleapis.com/v1beta/projects/${PROJECT_ID}/defaultBucket"

echo "==> Ensure Firebase Storage default bucket"

TOKEN="$(gcloud auth print-access-token)"
STATUS="$(curl -sS -o /tmp/firebase-default-bucket.json -w "%{http_code}" \
  "$API_BASE" \
  -H "Authorization: Bearer $TOKEN")"

if [[ "$STATUS" == "200" ]]; then
  BUCKET_NAME="$(python3 -c "import json; print(json.load(open('/tmp/firebase-default-bucket.json'))['bucket']['name'].split('/')[-1])")"
  echo "Default bucket already configured: ${BUCKET_NAME}"
  exit 0
fi

if [[ "$STATUS" == "404" ]]; then
  echo "Creating Firebase Storage default bucket in ${LOCATION}..."
  curl -sS -X POST "$API_BASE" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"location\":\"${LOCATION}\"}" \
    | python3 -c "import json,sys; data=json.load(sys.stdin); print('Created:', data['bucket']['name'].split('/')[-1])"
  exit 0
fi

echo "Failed to read Firebase Storage config (HTTP ${STATUS})."
cat /tmp/firebase-default-bucket.json 2>/dev/null || true
echo ""
echo "The deploy service account needs roles/firebase.admin and roles/firebasestorage.admin."
exit 1
