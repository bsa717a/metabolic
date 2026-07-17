import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { normalizePhone, phoneDigits, phonesMatch } from '../utils/phone.js';

function normalizeVirtualCoachSmsNumber(raw: string) {
  return raw.replace(/^sms:/i, '').trim();
}

function validateTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    throw new Error('Enter a valid timezone (for example, America/Denver).');
  }
}

function formatPhoneDisplay(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7);
    return `(${area}) ${prefix}-${line}`;
  }
  return phone;
}

function assertPersonalMobilePhone(phone: string) {
  const coachNumber = normalizeVirtualCoachSmsNumber(env.TWILIO_PHONE_NUMBER) || '+13853634403';
  if (phonesMatch(coachNumber, phone)) {
    throw new Error('That is the coach texting number — I need your personal cell phone instead.');
  }
  const digits = phoneDigits(phone);
  if (digits.length < 10) {
    throw new Error('That phone number does not look complete — include your area code.');
  }
}

export function extractPhoneFromUserText(text: string): string | null {
  const formatted = text.match(/(?:\+?1[-.\s.]?)?(?:\(?[2-9]\d{2}\)?[-\s.]?)[2-9]\d{2}[-\s.]?\d{4}\b/);
  if (formatted) return formatted[0];
  const bare = text.match(/\b([2-9]\d{9})\b/);
  return bare?.[1] ?? null;
}

export function isSmsSetupConversation(messages: Array<{ content: string }>) {
  return messages.some((message) =>
    /sms|text(ing)?|phone|reminder|number|cell|mobile|setup|contact/i.test(message.content)
  );
}

export async function tryAutoSavePhoneFromChat(
  userId: string,
  lastUserMessage: string,
  messages: Array<{ content: string }>,
  currentPhone: string | null | undefined
): Promise<{ ok: true; result: string } | { ok: false; error: string } | null> {
  const phone = extractPhoneFromUserText(lastUserMessage);
  if (!phone) return null;
  if (!isSmsSetupConversation(messages) && currentPhone?.trim()) return null;

  try {
    const { result } = await updateUserSmsSetup(userId, { phone });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not save your phone number.'
    };
  }
}

export type UpdateUserSmsSetupInput = {
  phone?: string;
  timezone?: string;
  smsMealRemindersEnabled?: boolean;
  smsEveningRecapEnabled?: boolean;
  /** When true, turn on meal and evening recap reminders. */
  enableReminders?: boolean;
};

export async function updateUserSmsSetup(userId: string, input: UpdateUserSmsSetupInput) {
  if (
    input.phone === undefined &&
    input.timezone === undefined &&
    input.smsMealRemindersEnabled === undefined &&
    input.smsEveningRecapEnabled === undefined &&
    input.enableReminders !== true
  ) {
    throw new Error('Nothing to update — provide a phone number, timezone, or reminder setting.');
  }

  const current = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      phone: true,
      timezone: true,
      smsMealRemindersEnabled: true,
      smsEveningRecapEnabled: true,
      smsRemindersEnabled: true
    }
  });

  const data: {
    phone?: string | null;
    timezone?: string | null;
    smsMealRemindersEnabled?: boolean;
    smsEveningRecapEnabled?: boolean;
    smsRemindersEnabled?: boolean;
  } = {};

  if (input.phone !== undefined) {
    const trimmed = input.phone.trim();
    if (!trimmed) {
      throw new Error('Phone number is required.');
    }
    const normalized = normalizePhone(trimmed);
    assertPersonalMobilePhone(normalized);
    data.phone = normalized;
  }

  if (input.timezone !== undefined) {
    const trimmed = input.timezone.trim();
    data.timezone = trimmed ? validateTimezone(trimmed) : null;
  }

  const enableReminders = input.enableReminders === true;
  const mealReminders =
    input.smsMealRemindersEnabled ?? (enableReminders ? true : undefined);
  const eveningRecap =
    input.smsEveningRecapEnabled ?? (enableReminders ? true : undefined);

  if (mealReminders !== undefined) data.smsMealRemindersEnabled = mealReminders;
  if (eveningRecap !== undefined) data.smsEveningRecapEnabled = eveningRecap;

  if (data.phone && mealReminders === undefined && eveningRecap === undefined) {
    if (!current.smsMealRemindersEnabled && !current.smsEveningRecapEnabled) {
      data.smsMealRemindersEnabled = true;
      data.smsEveningRecapEnabled = true;
    }
  }

  if (data.smsMealRemindersEnabled !== undefined || data.smsEveningRecapEnabled !== undefined) {
    const meal = data.smsMealRemindersEnabled ?? current.smsMealRemindersEnabled;
    const evening = data.smsEveningRecapEnabled ?? current.smsEveningRecapEnabled;
    data.smsRemindersEnabled = meal || evening;
  }

  if (!Object.keys(data).length) {
    throw new Error('Nothing to update.');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      phone: true,
      timezone: true,
      smsMealRemindersEnabled: true,
      smsEveningRecapEnabled: true,
      smsRemindersEnabled: true
    }
  });

  const parts: string[] = [];
  if (data.phone) {
    parts.push(`Saved your mobile phone as ${formatPhoneDisplay(updated.phone!)}.`);
  }
  if (data.timezone) {
    parts.push(`Set your timezone to ${updated.timezone}.`);
  }
  if (data.smsMealRemindersEnabled !== undefined || data.smsEveningRecapEnabled !== undefined) {
    const reminders: string[] = [];
    if (updated.smsMealRemindersEnabled) reminders.push('meal reminders');
    if (updated.smsEveningRecapEnabled) reminders.push('evening recap');
    parts.push(
      reminders.length
        ? `Turned on ${reminders.join(' and ')}.`
        : 'Turned off text reminders.'
    );
  }

  const stillNeeded: string[] = [];
  if (!updated.phone) stillNeeded.push('mobile phone');
  if (!updated.timezone) stillNeeded.push('timezone');
  if (!updated.smsRemindersEnabled) stillNeeded.push('text reminders');

  let result = parts.join(' ');
  if (stillNeeded.length) {
    result += ` Still needed for SMS: ${stillNeeded.join(', ')}.`;
  } else {
    result +=
      ' Your SMS profile is set up. If you saved my contact during setup, text me from that contact; otherwise text START once from your phone to opt in to two-way texting.';
  }

  return { result: result.trim(), user: updated };
}
