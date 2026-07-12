/** Support contact email shown on the public /support page. */
export const SUPPORT_EMAIL = 'support@master-metabolic.com';

/**
 * Public privacy policy URL for the Metabolic app.
 *
 * CONFIGURATION PLACEHOLDER — no app-wide privacy policy page exists yet. When one is
 * published, set this to its URL (an absolute https:// URL or an in-app route like
 * "/privacy"). While empty, the /support page hides the privacy-policy link.
 */
export const PRIVACY_POLICY_URL: string = '';

/** Issue categories offered on the public support form (must match the server allowlist). */
export const SUPPORT_CATEGORIES = [
  'Sign-in or account',
  'Billing or subscription',
  'Nutrition plan',
  'Coach or messaging',
  'Technical issue',
  'Privacy or account deletion',
  'Other'
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
