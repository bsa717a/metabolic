#!/usr/bin/env bash
# Provision Cloud Scheduler for proactive SMS reminders (pre-meal nudges + evening recap).
# Run once with a project admin account. CI deploy calls this in best-effort mode.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-metabolic-api}"
JOB_NAME="${SMS_SCHEDULER_JOB:-metabolic-sms-tick}"
BEST_EFFORT="${BEST_EFFORT:-false}"

fail() {
  echo "$1" >&2
  if [[ "$BEST_EFFORT" == "true" ]]; then
    echo "WARN: Skipping Cloud Scheduler setup (best-effort)." >&2
    echo "  Run once with admin credentials: ./scripts/setup-sms-scheduler.sh" >&2
    exit 0
  fi
  exit 1
}

gcloud config set project "$PROJECT_ID" >/dev/null

API_URL="${API_URL:-$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)}"
if [[ -z "$API_URL" ]]; then
  fail "Could not resolve Cloud Run URL for $SERVICE_NAME. Deploy the API first."
fi

CRON_SECRET_VALUE="$(gcloud secrets versions access latest --secret=CRON_SECRET 2>/dev/null || true)"
if [[ -z "$CRON_SECRET_VALUE" ]]; then
  fail "CRON_SECRET secret not found. Create it with: echo -n \"\$(openssl rand -hex 32)\" | gcloud secrets create CRON_SECRET --data-file=-"
fi

if ! gcloud services list --enabled --filter="config.name:cloudscheduler.googleapis.com" --format="value(config.name)" 2>/dev/null | grep -q cloudscheduler; then
  if ! gcloud services enable cloudscheduler.googleapis.com --quiet; then
    fail "Could not enable cloudscheduler.googleapis.com (requires project admin / Service Usage Admin)."
  fi
fi

SCHEDULER_ARGS=(
  --location "$REGION"
  --schedule "*/5 * * * *"
  --uri "${API_URL}/api/internal/sms/tick"
  --http-method POST
  --attempt-deadline 60s
)

if gcloud scheduler jobs describe "$JOB_NAME" --location "$REGION" >/dev/null 2>&1; then
  if ! gcloud scheduler jobs update http "$JOB_NAME" "${SCHEDULER_ARGS[@]}" \
    --update-headers "X-Cron-Secret=${CRON_SECRET_VALUE}"; then
    fail "Could not update Cloud Scheduler job $JOB_NAME."
  fi
  echo "Updated Cloud Scheduler job: $JOB_NAME -> ${API_URL}/api/internal/sms/tick"
else
  if ! gcloud scheduler jobs create http "$JOB_NAME" "${SCHEDULER_ARGS[@]}" \
    --headers "X-Cron-Secret=${CRON_SECRET_VALUE}"; then
    fail "Could not create Cloud Scheduler job $JOB_NAME (requires Cloud Scheduler Admin)."
  fi
  echo "Created Cloud Scheduler job: $JOB_NAME -> ${API_URL}/api/internal/sms/tick"
fi
