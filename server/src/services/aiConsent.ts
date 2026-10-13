import { prisma } from '../db/prisma.js';

export const AI_CONSENT_REQUIRED_MESSAGE =
  'AI features are off until you accept sharing data with Google Gemini.';

export function hasGrantedAiConsent(user: { aiConsentAccepted?: boolean } | null | undefined) {
  return Boolean(user?.aiConsentAccepted);
}

export async function userHasGrantedAiConsent(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiConsentAccepted: true }
  });
  return hasGrantedAiConsent(user);
}
