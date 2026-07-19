#!/usr/bin/env bash
# One-time GCP infrastructure for Metabolic (metabolic-v1).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
REGION="${REGION:-us-central1}"
SQL_INSTANCE="${SQL_INSTANCE:-metabolic-db}"
AR_REPO="${AR_REPO:-metabolic}"
DB_NAME="${DB_NAME:-metabolic}"
DB_USER="${DB_USER:-metabolic}"

if [[ -z "${METABOLIC_DB_PASSWORD:-}" ]]; then
  echo "Set METABOLIC_DB_PASSWORD before running setup."
  echo "Example: export METABOLIC_DB_PASSWORD=\$(openssl rand -base64 24)"
  exit 1
fi

echo "==> Project: $PROJECT_ID  Region: $REGION"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs (no-op if already enabled)"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Artifact Registry"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Metabolic API images"
fi

echo "==> Cloud SQL PostgreSQL"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-type=SSD \
    --no-backup \
    --availability-type=ZONAL
fi

gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" 2>/dev/null || true
gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$METABOLIC_DB_PASSWORD" 2>/dev/null \
  || gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$METABOLIC_DB_PASSWORD"

CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
ENCODED_PASSWORD="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$METABOLIC_DB_PASSWORD")"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION}"

echo "==> Secret Manager (DATABASE_URL)"
if gcloud secrets describe DATABASE_URL >/dev/null 2>&1; then
  printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=-
else
  printf '%s' "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-
fi

echo ""
echo "Setup complete."
echo "Cloud SQL connection: $CONNECTION"
echo ""
echo "Next: add remaining secrets manually, then run ./scripts/gcp-deploy.sh"
echo "  gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=path/to/key.pem"
echo "  echo -n 'your-client-email' | gcloud secrets create FIREBASE_CLIENT_EMAIL --data-file=-"
echo "  echo -n '$PROJECT_ID' | gcloud secrets create FIREBASE_PROJECT_ID --data-file=-"
echo "  echo -n 'your-gemini-key' | gcloud secrets create GEMINI_API_KEY --data-file=-"
echo "  echo -n 'your-openai-key' | gcloud secrets create OPENAI_API_KEY --data-file=-"
echo "  echo -n \"\$(openssl rand -hex 32)\" | gcloud secrets create UNSUBSCRIBE_TOKEN_SECRET --data-file=-"
echo "  echo -n 'https://${PROJECT_ID}.web.app' | gcloud secrets create CLIENT_URL --data-file=-"
