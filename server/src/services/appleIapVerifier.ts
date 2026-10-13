import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload
} from '@apple/app-store-server-library';
import { env } from '../config/env.js';
import { appleRootCaDerBuffers } from './appleIapRootCerts.js';
import { dateFromAppleMillis } from './appleIapEntitlement.js';
import {
  AppleIapError,
  type AppleSignedDataVerifier,
  type VerifiedAppleNotification,
  type VerifiedAppleTransaction
} from './appleIapTypes.js';

function mapEnvironment(value: string): Environment {
  switch (value) {
    case 'Sandbox':
      return Environment.SANDBOX;
    case 'Xcode':
      return Environment.XCODE;
    case 'LocalTesting':
      return Environment.LOCAL_TESTING;
    default:
      return Environment.PRODUCTION;
  }
}

function environmentsToTry(): Environment[] {
  if (env.APPLE_IAP_ENVIRONMENT === 'Sandbox') return [Environment.SANDBOX, Environment.PRODUCTION];
  if (env.APPLE_IAP_ENVIRONMENT === 'Production') return [Environment.PRODUCTION, Environment.SANDBOX];
  return [Environment.PRODUCTION, Environment.SANDBOX];
}

function toVerifiedTransaction(payload: JWSTransactionDecodedPayload): VerifiedAppleTransaction {
  if (!payload.transactionId || !payload.originalTransactionId || !payload.productId || !payload.bundleId) {
    throw new AppleIapError('Apple transaction is missing required fields', 400);
  }
  return {
    transactionId: payload.transactionId,
    originalTransactionId: payload.originalTransactionId,
    productId: payload.productId,
    bundleId: payload.bundleId,
    environment: payload.environment ?? 'Production',
    purchaseDate: dateFromAppleMillis(payload.purchaseDate),
    expiresDate: dateFromAppleMillis(payload.expiresDate),
    revocationDate: dateFromAppleMillis(payload.revocationDate),
    appAccountToken: payload.appAccountToken ?? null,
    type: payload.type ? String(payload.type) : null,
    isUpgraded: Boolean(payload.isUpgraded)
  };
}

function createVerifier(environment: Environment): SignedDataVerifier {
  return new SignedDataVerifier(
    appleRootCaDerBuffers(),
    env.APPLE_IAP_ENABLE_ONLINE_CHECKS,
    environment,
    env.APPLE_BUNDLE_ID,
    env.APPLE_APP_APPLE_ID
  );
}

async function verifyWithFallback<T>(run: (verifier: SignedDataVerifier) => Promise<T>): Promise<T> {
  const errors: unknown[] = [];
  for (const environment of environmentsToTry()) {
    try {
      return await run(createVerifier(environment));
    } catch (error) {
      errors.push(error);
    }
  }
  const last = errors.at(-1);
  const message = last instanceof Error ? last.message : 'Unable to verify Apple signed data';
  throw new AppleIapError(message, 400);
}

export const appleSignedDataVerifier: AppleSignedDataVerifier = {
  async verifyTransaction(signedTransaction: string): Promise<VerifiedAppleTransaction> {
    const payload = await verifyWithFallback((verifier) => verifier.verifyAndDecodeTransaction(signedTransaction));
    const verified = toVerifiedTransaction(payload);
    if (verified.bundleId !== env.APPLE_BUNDLE_ID) {
      throw new AppleIapError('Apple transaction bundle does not match this app', 400);
    }
    return verified;
  },

  async verifyNotification(signedPayload: string): Promise<VerifiedAppleNotification> {
    const notification = await verifyWithFallback((verifier) =>
      verifier.verifyAndDecodeNotification(signedPayload)
    );
    return decodeVerifiedNotification(notification, appleSignedDataVerifier);
  }
};

export async function decodeVerifiedNotification(
  notification: ResponseBodyV2DecodedPayload,
  transactionVerifier: AppleSignedDataVerifier
): Promise<VerifiedAppleNotification> {
  const signedTransaction = notification.data?.signedTransactionInfo;
  const transaction = signedTransaction ? await transactionVerifier.verifyTransaction(signedTransaction) : null;
  return {
    notificationType: String(notification.notificationType ?? ''),
    subtype: notification.subtype ? String(notification.subtype) : null,
    notificationUUID: notification.notificationUUID ?? null,
    transaction
  };
}
