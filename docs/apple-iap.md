# Apple IAP — digital plans

Capacitor iOS sells two auto-renewable subscriptions in the `metabolic_digital` group. Web digital billing stays on the existing `/api/billing/checkout` admin/manual seam. Physical `/store` checkout stays on Stripe.

## Catalog

| Plan | Internal | Apple product ID | Interval | App Store price |
| --- | --- | --- | --- | --- |
| Starter | `STARTER` / `starter` | none (free) | — | — |
| Self-Guided Metabolic | `SELF_GUIDED` / `self_guided` | `com.mastermetabolic.app.plan.self_guided.monthly` | monthly | $19.99 |
| Metabolic Plus | `PLUS` / `plus` | `com.mastermetabolic.app.plan.plus.monthly` | monthly | $59.99 |
| Coach-Led | `COACH_LED` / `coach_led` | none — admin/coach assigned only | — | — |

iOS UI must show StoreKit localized `displayPrice`, not the web `$19/$59` copy.

## Entitlement write path

Verified Apple transactions call the same `User.plan` / `User.subscriptionStatus` fields as admin/web:

- Active Self-Guided or Plus → `plan` + `subscriptionStatus = ACTIVE` (or `PAST_DUE` on `DID_FAIL_TO_RENEW`) and `subscriptionSource = APPLE`
- Expired / refunded / revoked, and the user is Apple-managed → `STARTER` + `FREE`
- `COACH_LED` is never overwritten; the Apple product is stored and `nextPlanAfterCoach` is set
- Client claims are ignored. Only StoreKit 2 JWS verified with `@apple/app-store-server-library` + Apple Root CA G2/G3 updates entitlements

Account binding uses StoreKit `appAccountToken` (`User.appleAppAccountToken`) plus `User.appleOriginalTransactionId`. A transaction already linked to another user is rejected with 409.

## Server environment

```
APPLE_BUNDLE_ID=com.mastermetabolic.app
APPLE_APP_APPLE_ID=6810053439
APPLE_IAP_ENVIRONMENT=auto          # Production then Sandbox
APPLE_IAP_ENABLE_ONLINE_CHECKS=true # production OCSP; optional
APPLE_IAP_ISSUER_ID=                # optional App Store Server API
APPLE_IAP_KEY_ID=
APPLE_IAP_PRIVATE_KEY=              # .p8 PEM, optional
```

JWS verification does **not** need the In-App Purchase key. The key is only required for optional App Store Server API calls (Get Transaction Info, history). Keep it out of the repo.

## App Store Server Notifications V2

Configure both Production and Sandbox URLs in App Store Connect:

`POST https://<api-host>/api/billing/apple/notifications`

Body: `{ "signedPayload": "<jws>" }`. Respond 200 after verify; unknown/unlinked transactions are acknowledged so Apple does not retry forever.

## App Store Connect (not done in this PR)

1. Subscription group `metabolic_digital`
2. Two auto-renewable monthly products with the IDs above
3. Paid Applications agreement, tax, and banking
4. Sandbox testers
5. Server notification URL
6. New TestFlight binary after `cap:sync:ios` so `AppleIapPlugin` is in the native shell

## Client endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/billing/apple/account-token` | yes | stable UUID for `appAccountToken` |
| POST | `/api/billing/apple/transactions` | yes | verify purchase JWS |
| POST | `/api/billing/apple/restore` | yes | restore / refresh; `expireIfEmpty` only after a successful StoreKit read |
| POST | `/api/billing/apple/notifications` | no | App Store Server Notifications V2 |

Restore Purchases and current-entitlement refresh run on login and when the app returns to the foreground.
