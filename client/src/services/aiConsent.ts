import { AI_CONSENT_REQUIRED_MESSAGE } from '../content/aiConsentCopy';

export { AI_CONSENT_REQUIRED_MESSAGE };

export type AiConsentDecision = 'accepted' | 'declined';

const STORAGE_PREFIX = 'metabolic-ai-consent:';

type RuntimeConsent = { userId: string; accepted: boolean };

let runtimeConsent: RuntimeConsent = { userId: '', accepted: false };

export function aiConsentStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readLocalAiConsent(userId: string): AiConsentDecision | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(aiConsentStorageKey(userId));
    if (value === 'accepted' || value === 'declined') return value;
    return null;
  } catch {
    return null;
  }
}

export function writeLocalAiConsent(userId: string, decision: AiConsentDecision) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(aiConsentStorageKey(userId), decision);
  } catch {
    // ignore quota / private mode
  }
}

export function hasAcceptedAiConsent(user?: {
  id?: string;
  aiConsentAccepted?: boolean;
  aiConsentDecidedAt?: string | null;
} | null): boolean {
  if (!user?.id) return runtimeConsent.accepted;
  if (user.aiConsentDecidedAt) return Boolean(user.aiConsentAccepted);
  return user.aiConsentAccepted === true || readLocalAiConsent(user.id) === 'accepted';
}

export function hasDecidedAiConsent(user?: {
  id?: string;
  aiConsentDecidedAt?: string | null;
} | null): boolean {
  if (!user?.id) return false;
  return Boolean(user.aiConsentDecidedAt) || readLocalAiConsent(user.id) !== null;
}

export function syncRuntimeAiConsent(userId: string, accepted: boolean) {
  runtimeConsent = { userId, accepted };
}

export function syncRuntimeAiConsentFromUser(
  user?: {
    id?: string;
    aiConsentAccepted?: boolean;
    aiConsentDecidedAt?: string | null;
  } | null
) {
  if (!user?.id) {
    runtimeConsent = { userId: '', accepted: false };
    return;
  }
  runtimeConsent = { userId: user.id, accepted: hasAcceptedAiConsent(user) };
}

export function hasRuntimeAiConsent() {
  return runtimeConsent.accepted;
}

/** Member-facing Gemini sends. Admin email studio (`/api/admin/communications/ai/*`) is out of scope. */
export function isAiTransmissionPath(path: string) {
  const pathname = path.split('?')[0] ?? path;
  if (pathname.startsWith('/api/admin/')) return false;
  if (pathname === '/api/ai/coach-voice/available') return false;
  if (pathname === '/api/ai' || pathname.startsWith('/api/ai/')) return true;
  if (pathname === '/api/virtual-coach/check-in/start') return true;
  if (/^\/api\/virtual-coach\/check-in\/[^/]+\/message$/.test(pathname)) return true;
  if (/^\/api\/daily-logs\/[^/]+\/meal-recommendations$/.test(pathname)) return true;
  return false;
}

export function assertAiConsentForPath(path: string) {
  if (!isAiTransmissionPath(path)) return;
  if (runtimeConsent.accepted) return;
  throw new Error(AI_CONSENT_REQUIRED_MESSAGE);
}
