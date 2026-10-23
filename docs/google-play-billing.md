# Google Play Billing — digital plans

The Android app sells the same two auto-renewable subscriptions as Apple IAP. Web digital checkout stays on `/api/billing/checkout`. Physical `/store` checkout stays on Stripe and is not a Play product.

## Catalog

| Plan | Internal | Play product ID | Interval | Play price |
| --- | --- | --- | --- | --- |
| Starter | `STARTER` / `starter` | none (free) | — | — |
| Self-Guided Metabolic | `SELF_GUIDED` / `self_guided` | `com.mastermetabolic.app.plan.self_guided.monthly` | monthly | $19.99 |
| Metabolic Plus | `PLUS` / `plus` | `com.mastermetabolic.app.plan.plus.monthly` | monthly | $59.99 |
| Coach-Led | `COACH_LED` / `coach_led` | none — admin/coach assigned only | — | — |

Package name: `com.mastermetabolic.app`.

Android UI shows the Play `formattedPrice` when BillingClient returns it, and otherwise `$19.99/month` or `$59.99/month`.

Each product needs one monthly auto-renewing base plan in Play Console. Base plan id: **unknown**.

## Entitlement

Verified Play subscriptions write the same `User.plan` / `User.subscriptionStatus` fields as Apple:

- Active Self-Guided or Plus → `plan` + `subscriptionStatus = ACTIVE` (or `PAST_DUE` while the subscription is in a grace period) and `subscriptionSource = GOOGLE`
- Expiry date reached, `EXPIRED`, `REVOKED`, account hold, or paused, and the user is Google-managed → `STARTER` + `FREE` + `subscriptionSource = MANUAL`
- Cancel-at-period-end keeps access until `expiryTime`, same as Apple waiting for `EXPIRED`
- `COACH_LED` is never overwritten. The Play product is stored and `nextPlanAfterCoach` is set
- A different purchase token does not expire the subscription already stored on the user
- A higher admin/manual plan is not downgraded by a lower Play product
- Client claims are ignored. The server reads `purchases.subscriptionsv2.get` and then acknowledges

Account binding uses Play `obfuscatedAccountId` (`User.googleObfuscatedAccountId`, a UUID) plus `User.googlePurchaseToken`. A token already linked to another user is rejected with 409. The purchase is acknowledged only after that check.

## Client

`UpgradePage` uses Play Billing when `usesGooglePlayCheckout()` is true (native Android only). The purchase call passes the server-issued `obfuscatedAccountId`. The native plugin does not acknowledge; `POST /api/billing/google/purchases` does, after the Developer API read.

Restore and login/foreground refresh call `POST /api/billing/google/restore`. `expireIfEmpty` is true only after a successful Play query on Restore purchases.

## Server environment

Do not commit a service-account JSON file or private key.

```
GOOGLE_PLAY_PACKAGE_NAME=com.mastermetabolic.app
GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=     # unknown
GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY= # unknown, PEM, \n escaped like Firebase
GOOGLE_PLAY_RTDN_AUDIENCE=             # unknown until the push subscription exists
```

Scope for the service account: `https://www.googleapis.com/auth/androidpublisher`.

When `GOOGLE_PLAY_RTDN_AUDIENCE` is empty, the webhook accepts the Pub/Sub body and still re-reads the token from Play. When it is set, the `Authorization: Bearer` OIDC token must match that audience.

## Real-time developer notifications

Push the Play Console topic to:

`POST https://<api-host>/api/billing/google/rtdn`

API host: **unknown**. Path: `/api/billing/google/rtdn`.

Pub/Sub topic: **unknown**.
Pub/Sub push subscription: **unknown**.

Grant `google-play-developer-notifications@system.gserviceaccount.com` the Pub/Sub Publisher role on that topic. The webhook returns 200 for test notifications, unlinked tokens, and products that are not the two digital plans so Pub/Sub does not retry them forever.

## Play Console (not created in this PR)

Derek or Meta still has to supply or create:

| Item | Value |
| --- | --- |
| Package name | `com.mastermetabolic.app` |
| Self-Guided product id | `com.mastermetabolic.app.plan.self_guided.monthly` at $19.99 / month |
| Plus product id | `com.mastermetabolic.app.plan.plus.monthly` at $59.99 / month |
| Base plan id for each subscription | unknown |
| Play Console payments profile / merchant account | unknown |
| Linked Google Cloud project for API access | unknown |
| Service account email | unknown |
| Service account permission | Invite that email on the app with **View app information and download bulk reports**, **View financial data, orders, and cancellation survey responses**, and **Manage orders and subscriptions**. Acknowledge needs **Manage orders and subscriptions**. |
| Pub/Sub topic the RTDN webhook needs | unknown |
| Pub/Sub push subscription and OIDC audience | unknown. Point the push endpoint at `POST /api/billing/google/rtdn` and set `GOOGLE_PLAY_RTDN_AUDIENCE` to that URL. |
| Play App Signing SHA-256 | unknown (asset links still use a placeholder) |

No keystore, service-account JSON, or Play Console object is created by this change.

## Client endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/billing/google/account-id` | yes | stable id for `obfuscatedAccountId` |
| POST | `/api/billing/google/purchases` | yes | verify a purchase token, then acknowledge |
| POST | `/api/billing/google/restore` | yes | restore / refresh; `expireIfEmpty` only after a successful Play read |
| POST | `/api/billing/google/rtdn` | Pub/Sub | Real-time developer notifications |
