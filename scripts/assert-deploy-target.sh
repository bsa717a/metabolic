#!/usr/bin/env bash
# Guards for the staging deploy. Source this file; it does not run on its own.
# An unset DEPLOY_TARGET keeps the production scripts on their existing path.

PRODUCTION_PROJECT_ID="metabolic-v1"
STAGING_PROJECT_ID="metabolic-staging"
STAGING_REGION="us-central1"
STAGING_SQL_INSTANCE="metabolic-db"
STAGING_SQL_CONNECTION="metabolic-staging:us-central1:metabolic-db"
STAGING_SERVICE_NAME="metabolic-api"
STAGING_SERVICE_ACCOUNT="github-deploy@metabolic-staging.iam.gserviceaccount.com"

assert_deploy_target() {
  local target="${DEPLOY_TARGET:-}"
  if [[ -z "$target" ]]; then
    return 0
  fi

  case "$target" in
    production)
      if [[ "${PROJECT_ID:-$PRODUCTION_PROJECT_ID}" != "$PRODUCTION_PROJECT_ID" ]]; then
        echo "Refusing production deploy: PROJECT_ID must be ${PRODUCTION_PROJECT_ID}." >&2
        return 1
      fi
      ;;
    staging)
      if [[ "${PROJECT_ID:-}" != "$STAGING_PROJECT_ID" ]]; then
        echo "Refusing staging deploy: PROJECT_ID must be ${STAGING_PROJECT_ID}." >&2
        return 1
      fi
      if [[ "${REGION:-$STAGING_REGION}" != "$STAGING_REGION" ]]; then
        echo "Refusing staging deploy: REGION must be ${STAGING_REGION}." >&2
        return 1
      fi
      if [[ -n "${SQL_INSTANCE:-}" && "$SQL_INSTANCE" != "$STAGING_SQL_INSTANCE" ]]; then
        echo "Refusing staging deploy: SQL_INSTANCE must be ${STAGING_SQL_INSTANCE}." >&2
        return 1
      fi
      if [[ -n "${SERVICE_NAME:-}" && "$SERVICE_NAME" != "$STAGING_SERVICE_NAME" ]]; then
        echo "Refusing staging deploy: SERVICE_NAME must be ${STAGING_SERVICE_NAME} in ${STAGING_PROJECT_ID}." >&2
        return 1
      fi
      ;;
    *)
      echo "Refusing deploy: DEPLOY_TARGET must be production or staging." >&2
      return 1
      ;;
  esac
}

assert_staging_cloud_sql() {
  if [[ "${DEPLOY_TARGET:-}" != "staging" ]]; then
    return 0
  fi
  assert_deploy_target
  if [[ "${SQL_INSTANCE:-}" != "$STAGING_SQL_INSTANCE" ]]; then
    echo "Refusing staging migration: SQL_INSTANCE must be ${STAGING_SQL_INSTANCE}." >&2
    return 1
  fi
  local connection="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
  if [[ "$connection" != "$STAGING_SQL_CONNECTION" ]]; then
    echo "Refusing staging migration: Cloud SQL connection must be ${STAGING_SQL_CONNECTION}." >&2
    return 1
  fi
}

strip_space() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value//$'\n'/}"
  value="${value//[[:space:]]/}"
  printf '%s' "$value"
}

assert_staging_service_account() {
  local account
  account="$(strip_space "$1")"
  if [[ "$account" != "$STAGING_SERVICE_ACCOUNT" ]]; then
    echo "Refusing staging deploy: service account must be ${STAGING_SERVICE_ACCOUNT}." >&2
    return 1
  fi
  if [[ "$account" == *"metabolic-v1"* ]]; then
    echo "Refusing staging deploy: service account belongs to the production project." >&2
    return 1
  fi
}

assert_staging_workload_identity_provider() {
  local provider
  provider="$(strip_space "$1")"
  if [[ -z "$provider" ]]; then
    echo "Refusing staging deploy: workload identity provider is empty." >&2
    return 1
  fi
  if [[ "$provider" == *"metabolic-v1"* ]]; then
    echo "Refusing staging deploy: workload identity provider references metabolic-v1." >&2
    return 1
  fi
  case "$provider" in
    projects/*/locations/global/workloadIdentityPools/*/providers/*) ;;
    *)
      echo "Refusing staging deploy: workload identity provider is not a global provider resource." >&2
      return 1
      ;;
  esac
}

assert_staging_firebase_project() {
  local project_id
  project_id="$(strip_space "$1")"
  if [[ "$project_id" != "$STAGING_PROJECT_ID" ]]; then
    echo "Refusing staging deploy: Firebase project must be ${STAGING_PROJECT_ID}." >&2
    return 1
  fi
}

assert_staging_cloud_run_url() {
  local url
  url="$(strip_space "$1")"
  if [[ "$url" != https://* ]]; then
    echo "Refusing staging deploy: API URL must be https." >&2
    return 1
  fi
  if [[ "$url" != *".run.app"* ]]; then
    echo "Refusing staging deploy: API URL must be the staging Cloud Run host." >&2
    return 1
  fi
  if [[ "$url" == *"metabolic-v1"* || "$url" == *"metaos.mastermetabolic.com"* ]]; then
    echo "Refusing staging deploy: API URL points at production." >&2
    return 1
  fi
}
