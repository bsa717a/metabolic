/** Support contact email shown on the public /support page. */
export const SUPPORT_EMAIL = 'support@master-metabolic.com';

/**
 * Public privacy policy URL for the Metabolic app.
 */
export const PRIVACY_POLICY_URL: string = '/privacy';

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
