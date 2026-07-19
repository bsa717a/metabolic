# Message Center (Email) — local setup

Admin → **Email** opens `/admin/communications` (Users, Compose, Drafts, Templates, Sent).

## Env

**Client** (`client/.env`):

```bash
VITE_UNLAYER_PROJECT_ID=<your Unlayer project id>
```

**Server** (`server/.env`):

```bash
UNSUBSCRIBE_TOKEN_SECRET=<random secret>   # required in production
API_PUBLIC_URL=http://localhost:8080       # optional; asset URLs for email images
OPENAI_API_KEY=...                         # AI Studio generate/refine
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...
FIREBASE_CLIENT_EMAIL=...                  # image uploads to Storage
FIREBASE_PRIVATE_KEY=...
```

## Notes

- Visual compose uses Unlayer via a proxied embed at `GET /api/admin/communications/unlayer-embed`.
- Email images are stored under Firebase `communication-assets/` and served at `/api/communication-assets/*`; send inlines them as CID attachments through SendGrid.
- Optional categories append an unsubscribe footer; tokens resolve on the public `/unsubscribe` page.
