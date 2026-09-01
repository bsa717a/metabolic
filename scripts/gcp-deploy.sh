#!/usr/bin/env bash
# Build and deploy Metabolic API (Cloud Run) + client (Firebase Hosting).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
REGION="${REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-metabolic-db}"
AR_REPO="${AR_REPO:-metabolic}"
SERVICE_NAME="${SERVICE_NAME:-metabolic-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/api:${IMAGE_TAG}"
CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CI="${CI:-false}"

cd "$ROOT_DIR"
gcloud config set project "$PROJECT_ID"

echo "==> Apply database migrations"
if [[ "${SKIP_DB_MIGRATIONS:-false}" != "true" ]]; then
  "$ROOT_DIR/scripts/run-cloud-migrations.sh"
else
  echo "Skipped (SKIP_DB_MIGRATIONS=true)"
fi

echo "==> Configure Docker for Artifact Registry"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
# Buildx's container driver often gets 401 on Artifact Registry layer PUTs when
# it only has the gcloud credential helper. An explicit access-token login is
# what docker push (and the docker driver) can use reliably.
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "${REGION}-docker.pkg.dev"

echo "==> Build and push API image (linux/amd64 for Cloud Run)"
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  -f server/Dockerfile \
  -t "$IMAGE" \
  --push \
  .

echo "==> Deploy Cloud Run"
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --no-cpu-throttling \
  --min-instances 0 \
  --max-instances 2 \
  --add-cloudsql-instances "$CONNECTION" \
  --set-secrets "\
DATABASE_URL=DATABASE_URL:latest,\
FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,\
FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest,\
FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
UNSUBSCRIBE_TOKEN_SECRET=UNSUBSCRIBE_TOKEN_SECRET:latest,\
CLIENT_URL=CLIENT_URL:latest,\
TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest,\
TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest,\
TWILIO_PHONE_NUMBER=TWILIO_PHONE_NUMBER:latest,\
SENDGRID_API_KEY=SENDGRID_API_KEY:latest,\
SENDGRID_FROM_EMAIL=SENDGRID_FROM_EMAIL:latest,\
SENDGRID_FROM_NAME=SENDGRID_FROM_NAME:latest,\
CRON_SECRET=CRON_SECRET:latest" \
  --set-env-vars "NODE_ENV=production,AI_PROVIDER=gemini,SMS_AGENT_MODE=agent,SIGNUP_ALERT_PHONE=+19044030781"

API_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"
echo "API URL: $API_URL"

echo "==> Ensure Cloud Scheduler API is enabled (required for proactive SMS reminders)"
if ! gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null; then
  echo "WARN: Could not enable cloudscheduler.googleapis.com — run as project admin if SMS reminders are silent."
fi

echo "==> Ensure Cloud Scheduler job for proactive SMS reminders (best-effort)"
# CI often lacks permission to enable APIs or create scheduler jobs. Do not fail
# deploy when scheduler setup fails; run ./scripts/setup-sms-scheduler.sh once as admin.
API_URL="$API_URL" BEST_EFFORT=true "$ROOT_DIR/scripts/setup-sms-scheduler.sh" || true

echo "==> Set API_PUBLIC_URL + Twilio webhook validation (stable Cloud Run URL)"
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --update-env-vars "API_PUBLIC_URL=${API_URL},TWILIO_VALIDATE_SIGNATURE=true,TWILIO_WEBHOOK_URL=${API_URL}/api/sms/webhook"

has_client_env=false
if [[ -n "${VITE_FIREBASE_API_KEY:-}" ]]; then
  has_client_env=true
elif [[ -f client/.env.production ]]; then
  has_client_env=true
fi

if [[ "$has_client_env" == "false" ]]; then
  if [[ "$CI" == "true" ]]; then
    echo "Missing VITE_* secrets for client build in CI."
    exit 1
  fi
  echo ""
  echo "Create client/.env.production with VITE_API_URL and VITE_FIREBASE_* values, then re-run."
  echo "  VITE_API_URL=$API_URL"
  exit 0
fi

echo "==> Build client"
if [[ -f client/.env.production ]] && [[ -z "${VITE_FIREBASE_API_KEY:-}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source client/.env.production
  set +a
fi

npm run build --workspace client

echo "==> Ensure Firebase Storage is initialized"
"$ROOT_DIR/scripts/ensure-firebase-storage.sh"

echo "==> Deploy Firebase Hosting and Storage rules"
npx --yes firebase-tools@13 deploy --only hosting,storage --project "$PROJECT_ID"

echo ""
echo "Deployed."
echo "  API:      $API_URL/health"
echo "  Frontend: https://${PROJECT_ID}.web.app"
