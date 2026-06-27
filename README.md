# Metabolic

Metabolic is a dashboard-first app foundation for weight, nutrition, exercise, and program tracking.

## Local setup

```bash
npm install
docker compose up -d
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs on `http://localhost:8080` and the client on `http://localhost:5173`. Firebase Auth is the authentication source of truth. PostgreSQL stores roles, profiles, programs, meals, foods, exercises, logs, SMS messages, and AI lookup history. Seed users include placeholder Firebase UIDs and can also be linked on first authenticated request by matching email.

## AI (Gemini)

AI runs on the backend via the [Gemini API](https://ai.google.dev/). Get an API key from [Google AI Studio](https://aistudio.google.com/apikey), then in `server/.env`:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
```

Optional: `GEMINI_MODEL` defaults to `gemini-2.5-flash`. Without a key, the app falls back to mock estimates.

Features:
- **Nutrition page** — AI food lookup estimates macros from natural language
- **Assistant page** — chat with your live program, meal, and exercise context

Local Docker Postgres is exposed on host port `5433` to avoid conflicts with an existing local PostgreSQL service. Inside Docker it still uses port `5432`.

## Deploy to GCP (metabolic-v1)

Prerequisites: `gcloud auth login`, `gcloud auth application-default login`, `firebase login`, Blaze billing enabled.

### 1. One-time infrastructure

```bash
export METABOLIC_DB_PASSWORD="$(openssl rand -base64 24)"
chmod +x scripts/gcp-setup.sh scripts/gcp-deploy.sh
./scripts/gcp-setup.sh
```

Add Firebase Admin + app secrets to Secret Manager (service account JSON from Firebase Console → Project settings → Service accounts):

```bash
# FIREBASE_PRIVATE_KEY: paste the private_key field from the JSON (keep newlines)
gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=-
gcloud secrets create FIREBASE_CLIENT_EMAIL --data-file=-
echo -n metabolic-v1 | gcloud secrets create FIREBASE_PROJECT_ID --data-file=-
echo -n YOUR_GEMINI_KEY | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n https://metabolic-v1.web.app | gcloud secrets create CLIENT_URL --data-file=-
echo -n YOUR_TWILIO_ACCOUNT_SID | gcloud secrets create TWILIO_ACCOUNT_SID --data-file=-
echo -n YOUR_TWILIO_AUTH_TOKEN | gcloud secrets create TWILIO_AUTH_TOKEN --data-file=-
echo -n YOUR_TWILIO_PHONE_NUMBER | gcloud secrets create TWILIO_PHONE_NUMBER --data-file=-
echo -n YOUR_SENDGRID_API_KEY | gcloud secrets create SENDGRID_API_KEY --data-file=-
echo -n DoNotReply@MasterMetabolic.com | gcloud secrets create SENDGRID_FROM_EMAIL --data-file=-
echo -n 'Master Metabolic' | gcloud secrets create SENDGRID_FROM_NAME --data-file=-
# Shared secret for the proactive SMS reminder scheduler
echo -n "$(openssl rand -hex 32)" | gcloud secrets create CRON_SECRET --data-file=-
```

SMS/MMS notes: set `TWILIO_PHONE_NUMBER` with the `sms:` prefix (e.g. `sms:+13853634403`) so the number sends and receives over SMS+MMS. The number must be MMS-enabled in the Twilio console for users to text meal photos (including photos sent from iMessage, which arrive as MMS). Point the Twilio messaging webhook to `https://<api-url>/api/sms/webhook`. Production deploy sets `SMS_AGENT_MODE=agent` (Gemini tool-calling); local dev defaults to `tree` in `server/.env.example`. Proactive reminders use a Cloud Scheduler job (`metabolic-sms-tick`, every 5 minutes) that calls `/api/internal/sms/tick`, gated by the `CRON_SECRET` header. **You must enable the Cloud Scheduler API** (`gcloud services enable cloudscheduler.googleapis.com`) before the job can run. Deploy tries to configure this in best-effort mode; if CI lacks scheduler permissions, run once as a project admin:

```bash
./scripts/setup-sms-scheduler.sh
```

Grant the Cloud Run service account access after first deploy:

```bash
PROJECT_NUMBER=$(gcloud projects describe metabolic-v1 --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in DATABASE_URL FIREBASE_PRIVATE_KEY FIREBASE_CLIENT_EMAIL FIREBASE_PROJECT_ID GEMINI_API_KEY CLIENT_URL TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER SENDGRID_API_KEY SENDGRID_FROM_EMAIL SENDGRID_FROM_NAME CRON_SECRET; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
gcloud projects add-iam-policy-binding metabolic-v1 \
  --member="serviceAccount:${SA}" \
  --role="roles/cloudsql.client"
```

In Firebase Console: enable Email/Password (+ Google) auth; add `metabolic-v1.web.app` to Authorized domains.

### 2. Deploy app

```bash
cp client/.env.production.example client/.env.production
# Set VITE_API_URL after first deploy, or update after ./scripts/gcp-deploy.sh prints the URL
./scripts/gcp-deploy.sh
```

Production deploys apply Prisma migrations before Cloud Run is updated (`scripts/run-cloud-migrations.sh` in CI and `gcp-deploy.sh`). The API also runs migrations on startup via `server/docker-entrypoint.sh` as a fallback. Health check: `GET /health`.

### Copy local database to Cloud SQL

Requires local Docker Postgres running and `cloud-sql-proxy` installed.

```bash
export METABOLIC_DB_PASSWORD='your-cloud-sql-password'
./scripts/copy-local-db-to-cloud.sh
```

This replaces production app data with your local database (users, foods, programs, meals, etc.) while keeping Prisma migrations intact.

No deployment is performed automatically by CI. The server listens on `PORT` and includes a Dockerfile for Cloud Run.
