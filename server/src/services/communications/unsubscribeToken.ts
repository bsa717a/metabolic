import crypto from 'crypto';
import { env } from '../../config/env.js';

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEV_FALLBACK_SECRET = 'dev-unsubscribe-secret-change-me-local-only';

const getSecret = (): string => {
  if (env.UNSUBSCRIBE_TOKEN_SECRET) return env.UNSUBSCRIBE_TOKEN_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('UNSUBSCRIBE_TOKEN_SECRET must be configured in production');
  }
  return DEV_FALLBACK_SECRET;
};

export interface UnsubscribeTokenPayload {
  email: string | null;
  phone: string | null;
  category: string | null;
  exp: number;
}

export const generateToken = ({
  email = null,
  phone = null,
  category = null
}: {
  email?: string | null;
  phone?: string | null;
  category?: string | null;
}): string => {
  const payload: UnsubscribeTokenPayload = {
    email: email ? String(email).trim().toLowerCase() : null,
    phone: phone ? String(phone).trim() : null,
    category: category || null,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
};

export const verifyToken = (token: string): UnsubscribeTokenPayload | null => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as UnsubscribeTokenPayload;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};
