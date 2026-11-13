#!/usr/bin/env bash
# Behavior checks for the staging isolation guards. No cloud calls.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

expect_fail() {
  local label="$1"
  shift
  if "$@"; then
    fail "$label was expected to fail"
  fi
}

expect_ok() {
  local label="$1"
  shift
  if ! "$@"; then
    fail "$label was expected to pass"
  fi
}

source "$ROOT/scripts/assert-deploy-target.sh"

DEPLOY_TARGET="" PROJECT_ID="metabolic-v1" assert_deploy_target || fail "unset target should keep the production path"

DEPLOY_TARGET="production" PROJECT_ID="metabolic-v1" assert_deploy_target || fail "production project should pass"
expect_fail "production pointed at staging" \
  env DEPLOY_TARGET=production PROJECT_ID=metabolic-staging bash -c 'source scripts/assert-deploy-target.sh && assert_deploy_target'

expect_fail "staging pointed at production" \
  env DEPLOY_TARGET=staging PROJECT_ID=metabolic-v1 REGION=us-central1 bash -c 'source scripts/assert-deploy-target.sh && assert_deploy_target'
expect_fail "staging in the wrong region" \
  env DEPLOY_TARGET=staging PROJECT_ID=metabolic-staging REGION=us-east1 bash -c 'source scripts/assert-deploy-target.sh && assert_deploy_target'
expect_fail "staging with another SQL instance" \
  env DEPLOY_TARGET=staging PROJECT_ID=metabolic-staging REGION=us-central1 SQL_INSTANCE=metabolic-v1 bash -c 'source scripts/assert-deploy-target.sh && assert_staging_cloud_sql'

expect_ok "staging cloud sql" \
  env DEPLOY_TARGET=staging PROJECT_ID=metabolic-staging REGION=us-central1 SQL_INSTANCE=metabolic-db bash -c 'source scripts/assert-deploy-target.sh && assert_staging_cloud_sql'

expect_fail "production service account" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_service_account github-deploy@metabolic-v1.iam.gserviceaccount.com'
expect_ok "staging service account" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_service_account github-deploy@metabolic-staging.iam.gserviceaccount.com'

expect_fail "provider naming production" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_workload_identity_provider projects/1/locations/global/workloadIdentityPools/github/providers/metabolic-v1'
expect_ok "staging provider shape" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_workload_identity_provider projects/123/locations/global/workloadIdentityPools/github/providers/github'

expect_fail "production firebase project" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_firebase_project metabolic-v1'
expect_ok "staging firebase project" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_firebase_project metabolic-staging'
expect_ok "staging firebase project with a trailing newline" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_firebase_project "$(printf "%s\n" metabolic-staging)"'

expect_fail "production web host as API URL" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_cloud_run_url https://metaos.mastermetabolic.com'
expect_ok "cloud run URL" \
  env bash -c 'source scripts/assert-deploy-target.sh && assert_staging_cloud_run_url https://metabolic-api-abc-uc.a.run.app'

STAGING_URL="postgresql://metabolic:secret@localhost/metabolic?host=/cloudsql/metabolic-staging:us-central1:metabolic-db"
PROD_URL="postgresql://metabolic:secret@localhost/metabolic?host=/cloudsql/metabolic-v1:us-central1:metabolic-db"

expect_ok "staging database url" \
  env DEPLOY_TARGET=staging DATABASE_URL="$STAGING_URL" sh scripts/staging-database-url-guard.sh
expect_fail "production database url on staging" \
  env DEPLOY_TARGET=staging DATABASE_URL="$PROD_URL" sh scripts/staging-database-url-guard.sh
expect_ok "production url ignored when target is unset" \
  env DATABASE_URL="$PROD_URL" sh scripts/staging-database-url-guard.sh
expect_fail "empty staging database url" \
  env DEPLOY_TARGET=staging DATABASE_URL= sh scripts/staging-database-url-guard.sh

echo "staging deploy guards ok"
