#!/usr/bin/env bash
# One-time setup: GitHub Actions Workload Identity Federation for deploy workflow.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-metabolic-v1}"
GITHUB_REPO="${GITHUB_REPO:-bsa717a/metabolic}"
POOL_ID="${POOL_ID:-github}"
PROVIDER_ID="${PROVIDER_ID:-github}"
SA_NAME="${SA_NAME:-github-deploy}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
WIF_POOL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
WIF_PROVIDER="${WIF_POOL}/providers/${PROVIDER_ID}"

echo "==> Project: $PROJECT_ID  Repo: $GITHUB_REPO"

gcloud config set project "$PROJECT_ID"

echo "==> Enable required APIs (skip if already enabled on the project)"
# Note: do not enable cloudsql.googleapis.com here — it is internal-only and not
# required for deploy. Cloud SQL is provisioned via sqladmin.googleapis.com in gcp-setup.sh.
APIS=(
  iamcredentials.googleapis.com
  sts.googleapis.com
  run.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  firebase.googleapis.com
  firebasehosting.googleapis.com
  firebasestorage.googleapis.com
)
for api in "${APIS[@]}"; do
  if gcloud services enable "$api" --quiet 2>/dev/null; then
    echo "  enabled $api"
  else
    echo "  skipped $api (already enabled or insufficient permission — OK if infra exists)"
  fi
done

echo "==> Workload Identity Pool"
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location=global \
    --display-name="GitHub Actions"
fi

echo "==> Workload Identity Provider"
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
fi

echo "==> Deploy service account"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions deploy"
fi

echo "==> Allow GitHub repo to impersonate service account"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"

DEPLOY_ROLES=(
  roles/run.admin
  roles/artifactregistry.writer
  roles/iam.serviceAccountUser
  roles/secretmanager.secretAccessor
  roles/cloudsql.client
  roles/firebase.admin
  roles/firebasehosting.admin
  roles/firebasestorage.admin
  roles/serviceusage.serviceUsageConsumer
)

echo "==> Grant deploy roles to $SA_EMAIL"
for role in "${DEPLOY_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --quiet >/dev/null 2>&1 || true
done

cat <<EOF

Setup complete. Add these GitHub repository secrets
(Settings -> Secrets and variables -> Actions):

Required for GCP auth:
  GCP_WORKLOAD_IDENTITY_PROVIDER = ${WIF_PROVIDER}
  GCP_SERVICE_ACCOUNT            = ${SA_EMAIL}

Required for client build (Firebase web app config):
  VITE_API_URL
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_FIREBASE_VAPID_KEY
  VITE_SMS_PHONE_NUMBER=+13853634403

Also create a GitHub environment named "production" if you want deploy
approval gates (the workflow references it).

After secrets are set, merge to main to trigger deploy, or run the
workflow manually from the Actions tab.

EOF
