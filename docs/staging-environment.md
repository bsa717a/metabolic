# Staging environment

Staging mirrors production and stays isolated from it. Production is GCP project `metabolic-v1` (Firebase project of the same name) in `us-central1`. Every push to `main` runs `.github/workflows/deploy.yml`, which migrates the production Cloud SQL database and deploys the API to Cloud Run service `metabolic-api` and the client to Firebase Hosting.

The client is Firebase Hosting in production, not a second Cloud Run service. Staging uses that same split. A Cloud Run container for the static client would be a different app shape (its own nginx config, headers, and SPA fallback) and is a follow-up, not this change.

Nothing in this change creates the Firebase project, links billing, creates Cloud SQL, or reads the production database. Those stay stopped until Derek Fowler approves them.

## What is isolated

| | Production | Staging |
| --- | --- | --- |
| GCP / Firebase project | `metabolic-v1` | `metabolic-staging` |
| Owner | existing | `derek.fowler@gmail.com` only. Not `derek@4studentlives.com`. |
| Cloud Run API | `metabolic-api` | `metabolic-api` in the staging project |
| Client | Firebase Hosting `metabolic-v1.web.app` and `metaos.mastermetabolic.com` | Firebase Hosting `metabolic-staging.web.app`, then `staging.metaos.mastermetabolic.com` |
| Database | Cloud SQL `metabolic-v1:us-central1:metabolic-db` | Cloud SQL `metabolic-staging:us-central1:metabolic-db` |
| Firebase users | real accounts | new project, new user pool. Test accounts `t1@clifsmama.com` and `t3@clifsmama.com` |
| GitHub | environment `production` | environment `staging` |
| Deploy | push to `main`, or dispatch `Deploy` | push to branch `staging`, or dispatch `Deploy staging` |

A staging bug or a bad migration runs against `metabolic-staging` only. The workflow and the API container both refuse a database URL that contains `metabolic-v1` or that is not `metabolic-staging:us-central1:metabolic-db`. The workflow also refuses the production deploy service account and a Firebase project id other than `metabolic-staging`.

The staging client does not take `VITE_API_URL` from GitHub. After the API deploys, the client is built with that staging Cloud Run URL, so a copied production URL cannot point the staging site at the live API.

Staging does not create the Cloud Scheduler jobs `metabolic-sms-tick` and `metabolic-email-tick`. Those jobs are how production sends SMS and queued email. Staging also does not set the production signup-alert phone.

Do not run `scripts/copy-local-db-to-cloud.sh` or `scripts/import-legacy-user-cloud.sh` as part of standing staging up. Do not copy production rows into the staging database.

## What this PR changes

- `.github/workflows/deploy-staging.yml` deploys only project `metabolic-staging`, from the `staging` branch or `workflow_dispatch`, using GitHub environment `staging`.
- `.github/workflows/deploy.yml` is unchanged except for a comment. Pushes to `main` still deploy production.
- `scripts/gcp-deploy.sh` and `scripts/run-cloud-migrations.sh` keep today's behavior when `DEPLOY_TARGET` is unset. Staging sets `DEPLOY_TARGET=staging`, which turns on the refusals above and skips scheduler setup.
- `server/docker-entrypoint.sh` runs `scripts/staging-database-url-guard.sh` before `prisma migrate deploy` when `DEPLOY_TARGET=staging`. Production startup does not set that variable.
- `scripts/gcp-setup-staging.sh` is the paid-infrastructure script. It exits unless `I_UNDERSTAND_STAGING_CREATES_PAID_RESOURCES=yes`. It does not create the Firebase project and does not link billing.
- `scripts/gcp-github-actions-setup.sh` accepts `WIF_ENVIRONMENT`. Unset, it behaves as before. The staging setup script sets `WIF_ENVIRONMENT=staging`, so the new provider only accepts tokens from GitHub environment `staging` in `bsa717a/metabolic`. It refuses that flag on project `metabolic-v1`.
- CORS allows the staging web origins. Production origins are unchanged. A staging Firebase token still fails on the production API, because the projects do not share users.

## Still needs Derek's OK before anyone creates it

These are the stopped items. Do not create them until Derek says yes.

1. Firebase project `metabolic-staging`, which is also the GCP project. Owner: `derek.fowler@gmail.com`. Not `derek@4studentlives.com`. This PR does not create it.
2. Billing on that project (Blaze). Cloud SQL and Cloud Run require it. This PR does not link a billing account.
3. The Cloud SQL instance, Artifact Registry repository, and Secret Manager entries created by `scripts/gcp-setup-staging.sh`. Cloud SQL is the paid resource that starts billing immediately. This PR does not run the script.
4. The production database. Nothing in staging may migrate, dump, or copy it.

## Who creates what, after that OK

Derek Fowler (`derek.fowler@gmail.com`) does every step below. The GitHub Actions identity is `github-deploy@metabolic-staging.iam.gserviceaccount.com`, created by the setup script in the staging project only.

1. In the Firebase console, create project `metabolic-staging` while signed in as `derek.fowler@gmail.com`. Enable Email/Password. Add authorized domains `metabolic-staging.web.app`, `metabolic-staging.firebaseapp.com`, `localhost`, and later `staging.metaos.mastermetabolic.com`.
2. Create users `t1@clifsmama.com` and `t3@clifsmama.com` in that project. Derek chooses the passwords. Do not add those accounts to `metabolic-v1`. The first sign-in creates the app user in the empty staging database.
3. Register a Firebase web app. Put its config on the GitHub environment, not in the repo.
4. Create a Firebase Admin service account in `metabolic-staging` and store its client email and private key in that project's Secret Manager.
5. Link billing to `metabolic-staging`.
6. Run:

```bash
export METABOLIC_STAGING_DB_PASSWORD="$(openssl rand -base64 24)"
export I_UNDERSTAND_STAGING_CREATES_PAID_RESOURCES=yes
./scripts/gcp-setup-staging.sh
```

The script creates the `db-f1-micro` Postgres 16 instance, the `metabolic` database, Artifact Registry, the staging `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `CLIENT_URL`, `UNSUBSCRIBE_TOKEN_SECRET`, and `CRON_SECRET`, then the workload-identity pool. It will not run if the project is missing or billing is off.

7. Create GitHub environment `staging` and add environment secrets (Settings → Environments → staging). Repository secrets are the production values. An environment secret of the same name overrides them. If a name is missing on the environment, the workflow would inherit production, then the new guards fail the job before deploy.

| GitHub environment secret | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | provider printed by the setup script. Must not mention `metabolic-v1`. |
| `GCP_SERVICE_ACCOUNT` | `github-deploy@metabolic-staging.iam.gserviceaccount.com` |
| `VITE_FIREBASE_API_KEY` | staging web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | `metabolic-staging.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `metabolic-staging` |
| `VITE_FIREBASE_STORAGE_BUCKET` | staging bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | staging web app |
| `VITE_FIREBASE_APP_ID` | staging web app |
| `VITE_FIREBASE_VAPID_KEY` | staging Web Push key, or empty until push is needed |
| `VITE_SMS_PHONE_NUMBER` | empty, or a staging number. Do not copy `+13853634403` unless testers should text the production inbox. |

`VITE_API_URL` is not a staging secret. The workflow sets it from the staging Cloud Run service.

Secret Manager in `metabolic-staging` (the API mounts these by name):

| Secret | Who | Notes |
| --- | --- | --- |
| `DATABASE_URL` | setup script | Staging instance only. |
| `FIREBASE_PROJECT_ID` | setup script | `metabolic-staging` |
| `CLIENT_URL` | setup script | Defaults to `https://metabolic-staging.web.app`. After DNS, set `https://staging.metaos.mastermetabolic.com`. |
| `UNSUBSCRIBE_TOKEN_SECRET` | setup script | New random value. Not the production secret. |
| `CRON_SECRET` | setup script | Unused until someone later turns schedulers on. |
| `FIREBASE_PRIVATE_KEY` | Derek | Staging Admin SDK key. Not the production key. |
| `FIREBASE_CLIENT_EMAIL` | Derek | Staging Admin SDK email. |
| `GEMINI_API_KEY` | Derek | Separate key recommended. `disabled` keeps the service from calling Gemini. Do not copy the production key if spend should stay separate. |
| `OPENAI_API_KEY` | Derek | Same as Gemini. |
| `TWILIO_ACCOUNT_SID` | Derek | `disabled`, or a different Twilio account. Do not copy production. |
| `TWILIO_AUTH_TOKEN` | Derek | Same. |
| `TWILIO_PHONE_NUMBER` | Derek | Same. Do not point the production Twilio webhook at the staging API. |
| `RESEND_API_KEY` | Derek | `disabled`, or a separate Resend key. |
| `SENDGRID_FROM_EMAIL` | Derek | A valid address such as `staging-disabled@mastermetabolic.com`. The API rejects a non-email value. |
| `SENDGRID_FROM_NAME` | Derek | `Master Metabolic Staging` |

Cloud Run will not start until every mounted secret exists. Placeholders above are not live credentials.

8. After this PR is merged, create branch `staging` from `main` and push it, or run Actions → Deploy staging. Do not push a `staging` branch before the secrets exist if you want the first run to succeed. A run without secrets fails before it can reach production.

Grant the Cloud Run runtime service account `secretAccessor` on the staging secrets and `cloudsql.client` on `metabolic-staging`, the same loop as production in the README, with project `metabolic-staging` and that project's compute service account. Do not bind that account on `metabolic-v1`.

## DNS

Intended public URL: `https://staging.metaos.mastermetabolic.com`.

Until that record exists, the site is `https://metabolic-staging.web.app`.

Derek (or whoever controls DNS for `mastermetabolic.com`) adds the records Firebase Hosting shows after he attaches the custom domain to project `metabolic-staging`. The console is the source for the record type and target. Firebase's custom-domain steps are at <https://firebase.google.com/docs/hosting/custom-domain>. For a subdomain, that flow shows an ownership TXT record and a CNAME. This plan does not invent A-record addresses.

`metaos.mastermetabolic.com` stays on production. Adding the `staging` label does not move it.

After the hostname serves the staging site, update secret `CLIENT_URL` to `https://staging.metaos.mastermetabolic.com` and redeploy staging so email links use it.

## Monthly cost

Prices below are Google's published USD list prices, checked 11 November 2026. They are not a quote from the billing account. A 730-hour month is used only to turn an hourly list price into a month, which is the usual way those pages present a month. Tax, credits, and committed-use discounts are not included.

### Cloud SQL, the floor

The setup script creates the same shape as production's setup script: PostgreSQL 16, Enterprise edition, `db-f1-micro` (shared core, 0.6 GiB), `us-central1`, zonal, 10 GB SSD, backups off.

Google's PostgreSQL pricing example "Test instance" is **$9.37 per month** for `us-central1`, not highly available, no commitment, no backup storage, 10 GB storage, 0.6 GB memory, and a shared CPU. Source: <https://cloud.google.com/sql/docs/postgres/pricing-examples>.

The hourly shared-core price for `db-f1-micro` in Iowa (`us-central1`) is **$0.0105 per hour** ($7.665 across 730 hours). Source: <https://cloud.google.com/sql/pricing>. The $9.37 example is the combined published figure for this shape. Use that, not a hand-multiplied storage rate. The storage table on the pricing page depends on which region is selected in the page, so this plan does not cite a separate SSD unit price.

The same pricing page lists **IPv4 addresses while idle at $0.01 per hour** ($7.30 across 730 hours). It is unclear whether a running zonal instance with a public IP is billed that line. The $9.37 example does not add it. **Uncertain. Not included in the floor.** If the billing SKU appears, add about $7.30.

The instance is billed while it exists, including when nobody uses staging. `--no-backup` matches production's setup script, so backup storage is $0 until someone turns backups on. Backup bytes are listed at $0.000109589 per GiB-hour on the pricing page. None are included here.

### Cloud Run API

`scripts/gcp-deploy.sh` deploys 1 vCPU, 512Mi, `--no-cpu-throttling`, `--min-instances 0`, `--max-instances 2`. `--no-cpu-throttling` is instance-based billing: an instance is billed for its whole life, and with a minimum of 0 it can scale to zero.

Instance-based list prices (default, not a committed-use discount), from <https://cloud.google.com/run/pricing>:

- CPU **$0.000018 per vCPU-second**
- Memory **$0.000002 per GiB-second**

The free tier (first 240,000 vCPU-seconds and 450,000 GiB-seconds each month) is **per billing account, shared with production**. Do not assume staging receives it.

Worked example, not a measured bill: 20 hours of one 1 vCPU / 512Mi instance is 72,000 seconds. CPU $1.296, memory $0.072, about **$1.37**. Idle and scaled to zero is **$0** for this line.

Ceiling if one instance never scales down for 730 hours: CPU $47.30 and memory $2.63, about **$49.93**. That happens only if scale-to-zero does not. **Uncertain** how long Cloud Run keeps an instance after the last request. Expected idle cost is $0. There is no second Cloud Run service for the client.

### Firebase Hosting and Auth

Hosting no-cost quota is 10 GB stored and 360 MB/day transferred, and a custom domain is included. Sources: <https://firebase.google.com/pricing> and <https://firebase.google.com/docs/hosting/usage-quotas-pricing>. A staging web build should sit inside that. **Expected $0.** Uncertain only if transfer exceeds 360 MB/day, which this plan does not estimate.

Email/password, and the other non-phone auth methods, are marked no-cost on that pricing page ("Other Authentication services"). Phone auth is billed per SMS and is not part of staging. Two test users: **$0**.

Blaze is required so Cloud SQL and Cloud Run can run. The pricing page says Spark no-cost usage is included on Blaze.

### Secret Manager and Artifact Registry

Secret Manager, <https://cloud.google.com/secret-manager/pricing>: first 6 active versions free per billing account per month, then $0.000082192 per version-hour. Google's own example treats a full month as **$0.06 per version**. The free tier is shared with production, which already has more than 6 versions, so staging versions are likely billed in full. The API mounts **15** secrets. 15 × $0.06 = **$0.90 per month** if every version is billed. Less if any free versions remain. **Uncertain** for that reason. Access operations are free for the first 10,000 per billing account per month, then $0.03 per 10,000. A deploy reads each secret a few times. Likely $0, uncertain if production already passes 10,000.

Artifact Registry, <https://cloud.google.com/artifact-registry/pricing>: $0.000136986 per GiB-hour after 0.5 GiB-month free per billing account, which is **$0.10 per GiB-month** (× 730). The free 0.5 GiB is probably already used by production images. The staging image size is unknown until the first push. **Uncertain.** Same-region pulls to Cloud Run in `us-central1` are $0 data transfer on that page.

### Not in this bill

Cloud Scheduler jobs are not created. Twilio, Resend, and Gemini stay at $0 until Derek stores live keys and someone uses them. Schedulers stay off, so staging does not poll SMS or email.

### Adding it up

The only combined price Google publishes for this database shape is **$9.37 per month**. Add about **$0.90** for 15 secret versions if the shared free tier is already used. Cloud Run at zero instances and Hosting inside the free quota add $0. A quiet month is therefore **about $10.27 before tax**, plus an unknown Artifact Registry amount that depends on image size.

Do not treat that as a billing-account quote. Add about **$7.30** if the idle IPv4 SKU is charged. Add up to about **$50** if one API instance stays up all month. A short test session is the $1.37 Cloud Run example, not that ceiling.

## Follow-ups, not in this PR

iOS TestFlight and Android Play are not wired to staging. Both workflows bake the production `VITE_*` values, and the native projects carry the production `GoogleService-Info.plist` / `google-services.json`. A flag that only changed the API URL would still sign in with production Firebase, and the staging API would reject those tokens. A real staging app also needs a bundle-id decision, because `com.mastermetabolic.app` cannot be installed twice. That is a separate change.

Google and Apple sign-in on staging need their own OAuth clients in `metabolic-staging`. Email/password is enough for `t1@clifsmama.com` and `t3@clifsmama.com`. Reusing the production OAuth client is not required and is easier to get wrong.

Staging Cloud Scheduler, a staging Twilio number, and a copy of non-user reference data (foods, exercise library) are separate decisions. Do not solve them by copying the production database.
