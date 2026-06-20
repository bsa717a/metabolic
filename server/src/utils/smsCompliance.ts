export const SMS_BRAND_NAME = 'Master Metabolic';

/** Auto-reply when a user texts START or UNSTOP. Must match Twilio campaign opt-in message. */
export function smsOptInConfirmationMessage() {
  return `${SMS_BRAND_NAME}: You're opted in for conversational SMS replies about meals, workouts, program status, progress, and support. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.`;
}

export function smsHelpResponseMessage() {
  return `${SMS_BRAND_NAME} SMS support: Text questions about your meals, workouts, program status, or progress. To log water, text "16 oz water" or "drank a glass of water". Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Email support@master-metabolic.com for help.`;
}

export function smsOptOutConfirmationMessage() {
  return `${SMS_BRAND_NAME}: You have opted out and will no longer receive SMS messages from this number. Reply START to resubscribe.`;
}

export function smsNoAccountResponseMessage(siteUrl: string) {
  const url = siteUrl.replace(/\/$/, '');
  return `${SMS_BRAND_NAME}: We don't have a Metabolic account for this number yet. Kick-start your metabolism at ${url} — create your account, add this phone number, then text START to log meals and get coaching by SMS.`;
}
