import { GoogleAuth } from 'google-auth-library';
import { env } from '../config/env.js';
import { GooglePlayError, type PlayDeveloperClient } from './googlePlayTypes.js';
import { parseSubscriptionPurchaseV2, settleAcknowledgement } from './googlePlayVerify.js';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export function playCredentialsConfigured() {
  return Boolean(env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY);
}

async function accessToken() {
  if (!playCredentialsConfigured()) {
    throw new GooglePlayError('Google Play Billing is not configured', 503);
  }

  const auth = new GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: [ANDROID_PUBLISHER_SCOPE]
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new GooglePlayError('Google Play Billing is not configured', 503);
  return token.token;
}

function publisherUrl(path: string) {
  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME || 'com.mastermetabolic.app';
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}${path}`;
}

export function createPlayDeveloperClient(fetchImpl: typeof fetch = fetch): PlayDeveloperClient {
  const client: PlayDeveloperClient = {
    async getSubscription(purchaseToken) {
      const token = await accessToken();
      const response = await fetchImpl(
        publisherUrl(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 404) throw new GooglePlayError('Google Play purchase was not found', 400);
      if (!response.ok) {
        throw new GooglePlayError(
          'Google Play could not verify this purchase',
          response.status === 401 || response.status === 403 ? 503 : 502
        );
      }
      return parseSubscriptionPurchaseV2(purchaseToken, await response.json());
    },

    async acknowledge(productId, purchaseToken) {
      const token = await accessToken();
      const response = await fetchImpl(
        publisherUrl(
          `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`
        ),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: '{}'
        }
      );
      await settleAcknowledgement(response.status, response.ok, () => client.getSubscription(purchaseToken));
    }
  };
  return client;
}

let singleton: PlayDeveloperClient | null = null;

export function playDeveloperClient(): PlayDeveloperClient {
  singleton ??= createPlayDeveloperClient();
  return singleton;
}
