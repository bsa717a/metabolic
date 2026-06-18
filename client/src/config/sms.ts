/** Public SMS number for opt-in disclosure (E.164). Override with VITE_SMS_PHONE_NUMBER at build time. */
export const SMS_PHONE_NUMBER = import.meta.env.VITE_SMS_PHONE_NUMBER?.trim() || '+19044030781';

export function formatSmsPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export const SMS_PHONE_DISPLAY = formatSmsPhoneDisplay(SMS_PHONE_NUMBER);

/** Public opt-in disclosure shown on /sms-opt-in and referenced in Twilio campaign registration. */
export const SMS_OPT_IN_DISCLOSURE =
  'By texting START, you agree to receive conversational SMS replies from Master Metabolic about your Metabolic account, including meals, workouts, program status, progress, and support. Message frequency varies based on your messages. Message and data rates may apply. Reply HELP for help or STOP to opt out.';
