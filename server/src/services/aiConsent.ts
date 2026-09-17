export const AI_CONSENT_REQUIRED_MESSAGE =
  'AI features are off until you accept sharing data with Google Gemini.';

export function hasGrantedAiConsent(user: { aiConsentAccepted?: boolean } | null | undefined) {
  return Boolean(user?.aiConsentAccepted);
}
