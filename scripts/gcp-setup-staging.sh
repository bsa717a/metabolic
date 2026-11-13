#!/usr/bin/env bash
# Create PAID staging infrastructure in GCP project metabolic-staging.
#
# Do not run this until Derek Fowler (derek.fowler@gmail.com) has approved
# the cost in docs/staging-environment.md. This script does not create the
# Firebase/GCP project, does not link billing, and does not touch metabolic-v1
# or the production database.
#
# Derek creates the Firebase project first (Authentication, not the production
# user pool), links billing himself, then runs:
#
#   export METABOLIC_STAGING_DB_PASSWORD="$(openssl rand -base64 24)"
#   export I_UNDERSTAND_STAGING_CREATES_PAID_RESOURCES=yes
#   ./scripts/gcp-setup-staging.sh
set -euo pipefail

PROJECT_ID="metabolic-staging"
REGION="us-central1"
SQL_INSTANCE="metabolic-db"
AR_REPO="metabolic"
DB_NAME="metabolic"
DB_USER="metabolic"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${I_UNDERSTAND_STAGING_CREATES_PAID_RESOURCES:-}" != "yes" ]]; then
  echo "Refusing: this creates a Cloud SQL instance and other billable resources."
  echo "Set I_UNDERSTAND_STAGING_CREATES_PAID_RESOURCES=yes after Derek approves the cost."
  exit 1
fi

if [[ -z "${METABOLIC_STAGING_DB_PASSWORD:-}" ]]; then
  echo "Set METABOLIC_STAGING_DB_PASSWORD. Do not reuse METABOLIC_DB_PASSWORD."
  exit 1
fi

if [[ "$PROJECT_ID" == "metabolic-v1" || "$SQL_INSTANCE" == *"metabolic-v1"* ]]; then
  echo "Refusing to set up staging inside the production project."
  exit 1
fi

gcloud_staging() {
  local arg
  for arg in "$@"; do
    if [[ "$arg" == *"metabolic-v1"* ]]; then
      echo "Refusing gcloud argument that mentions metabolic-v1: $arg" >&2
      exit 1
    fi
  done
  gcloud "$@" --project="$PROJECT_ID"
}

echo "==> Staging project: $PROJECT_ID  Region: $REGION"
echo "    Production project metabolic-v1 is not modified."

if ! gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  echo "Project ${PROJECT_ID} does not exist."
  echo "Derek creates it as a Firebase project, owner derek.fowler@gmail.com."
  echo "Do not use derek@4studentlives.com. This script will not create the project."
  exit 1
fi

BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
if [[ "$BILLING" != "True" && "$BILLING" != "true" ]]; then
  echo "Billing is not enabled on ${PROJECT_ID}."
  echo "Derek links the billing account after he approves the monthly cost."
  echo "This script does not link billing."
  exit 1
fi

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs (no-op if already enabled)"
gcloud_staging services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Artifact Registry"
if ! gcloud_staging artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud_staging artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Metabolic staging API images"
fi

echo "==> Cloud SQL PostgreSQL (staging instance only)"
if ! gcloud_staging sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud_staging sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-type=SSD \
    --no-backup \
    --availability-type=ZONAL
fi

gcloud_staging sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" 2>/dev/null || true
gcloud_staging sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$METABOLIC_STAGING_DB_PASSWORD" 2>/dev/null \
  || gcloud_staging sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$METABOLIC_STAGING_DB_PASSWORD"

CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
if [[ "$CONNECTION" != "metabolic-staging:us-central1:metabolic-db" ]]; then
  echo "Refusing to write a DATABASE_URL for ${CONNECTION}."
  exit 1
fi

ENCODED_PASSWORD="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$METABOLIC_STAGING_DB_PASSWORD")"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION}"

echo "==> Secret Manager (staging DATABASE_URL only)"
if gcloud_staging secrets describe DATABASE_URL >/dev/null 2>&1; then
  printf '%s' "$DATABASE_URL" | gcloud_staging secrets versions add DATABASE_URL --data-file=-
else
  printf '%s' "$DATABASE_URL" | gcloud_staging secrets create DATABASE_URL --data-file=-
fi

put_secret() {
  local name="$1"
  local value="$2"
  if [[ "$value" == *"metabolic-v1"* ]]; then
    echo "Refusing to store a production identifier in ${name}."
    exit 1
  fi
  if gcloud_staging secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud_staging secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud_staging secrets create "$name" --data-file=-
  fi
}

CLIENT_URL="${STAGING_CLIENT_URL:-https://metabolic-staging.web.app}"
case "$CLIENT_URL" in
  https://metabolic-staging.web.app|https://metabolic-staging.firebaseapp.com|https://staging.metaos.mastermetabolic.com) ;;
  *)
    echo "Refusing CLIENT_URL ${CLIENT_URL}. Use the staging web.app host or https://staging.metaos.mastermetabolic.com."
    exit 1
    ;;
esac
put_secret FIREBASE_PROJECT_ID "metabolic-staging"
put_secret CLIENT_URL "$CLIENT_URL"

put_secret_if_missing() {
  local name="$1"
  local value="$2"
  if gcloud_staging secrets describe "$name" >/dev/null 2>&1; then
    echo "Secret ${name} already exists. Leaving the current version."
    return
  fi
  put_secret "$name" "$value"
}

put_secret_if_missing UNSUBSCRIBE_TOKEN_SECRET "$(openssl rand -hex 32)"
put_secret_if_missing CRON_SECRET "$(openssl rand -hex 32)"

echo "==> Workload identity for GitHub environment staging"
PROJECT_ID="$PROJECT_ID" WIF_ENVIRONMENT=staging "$ROOT_DIR/scripts/gcp-github-actions-setup.sh"

echo ""
echo "Staging infrastructure is in ${PROJECT_ID} only."
echo "Cloud SQL connection: ${CONNECTION}"
echo "Client URL secret: ${CLIENT_URL}"
echo ""
echo "Still required from Derek, in project ${PROJECT_ID}. Do not copy production secrets."
echo "  Firebase web app config -> GitHub environment staging (VITE_FIREBASE_*)"
echo "  Firebase Admin private key and client email -> Secret Manager"
echo "  GEMINI_API_KEY, OPENAI_API_KEY, Twilio, and Resend only if staging should call those services"
echo "  Test users t1@clifsmama.com and t3@clifsmama.com in this Firebase project"
echo "Do not run scripts/copy-local-db-to-cloud.sh against production or into this database."
