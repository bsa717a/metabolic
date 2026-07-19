/** Communication categories, channels, and status enums (email-only build). */

export const COMMUNICATION_CATEGORIES = {
  SYSTEM_REQUIRED: 'SYSTEM_REQUIRED',
  ACCOUNT_NOTIFICATION: 'ACCOUNT_NOTIFICATION',
  TASK_REMINDER: 'TASK_REMINDER',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  TRAINING: 'TRAINING',
  GENERAL: 'GENERAL'
} as const;

export interface CommunicationCategoryMeta {
  label: string;
  allowsUnsubscribe: boolean;
}

export const COMMUNICATION_CATEGORY_META: Record<string, CommunicationCategoryMeta> = {
  [COMMUNICATION_CATEGORIES.SYSTEM_REQUIRED]: {
    label: 'System Required',
    allowsUnsubscribe: false
  },
  [COMMUNICATION_CATEGORIES.ACCOUNT_NOTIFICATION]: {
    label: 'Account Notification',
    allowsUnsubscribe: false
  },
  [COMMUNICATION_CATEGORIES.TASK_REMINDER]: {
    label: 'Task Reminder',
    allowsUnsubscribe: true
  },
  [COMMUNICATION_CATEGORIES.ANNOUNCEMENT]: {
    label: 'Announcement',
    allowsUnsubscribe: true
  },
  [COMMUNICATION_CATEGORIES.TRAINING]: {
    label: 'Training',
    allowsUnsubscribe: true
  },
  [COMMUNICATION_CATEGORIES.GENERAL]: {
    label: 'General',
    allowsUnsubscribe: true
  }
};

export const COMMUNICATION_CHANNELS = {
  EMAIL: 'email',
  TEXT: 'text',
  BOTH: 'both'
} as const;

export const SKIP_REASONS = {
  MISSING_EMAIL: 'missing_email',
  MISSING_PHONE: 'missing_phone',
  UNSUBSCRIBED_EMAIL: 'unsubscribed_email',
  UNSUBSCRIBED_TEXT: 'unsubscribed_text',
  SMS_NOT_OPTED_IN: 'sms_not_opted_in'
} as const;

export const RECIPIENT_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped'
} as const;

export const COMMUNICATION_STATUS = {
  DRAFT: 'draft',
  SENDING: 'sending',
  SENT: 'sent',
  PARTIAL: 'partial',
  FAILED: 'failed'
} as const;

export const UNSUBSCRIBE_SOURCES = {
  UNSUBSCRIBE_LINK: 'unsubscribe_link',
  ADMIN: 'admin',
  MANUAL: 'manual',
  SYSTEM: 'system'
} as const;

export const categoryAllowsUnsubscribe = (category: string): boolean =>
  COMMUNICATION_CATEGORY_META[category]?.allowsUnsubscribe === true;

export const isValidCategory = (category: string): boolean =>
  Object.prototype.hasOwnProperty.call(COMMUNICATION_CATEGORY_META, category);

export const isValidChannel = (channel: string): boolean =>
  (Object.values(COMMUNICATION_CHANNELS) as string[]).includes(channel);
