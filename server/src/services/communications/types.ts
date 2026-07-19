export type CommunicationChannel = 'email' | 'text' | 'both';

export interface RecipientInput {
  userId?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  isExternal?: boolean;
}

export interface NormalizedRecipient {
  userId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  isExternal: boolean;
}

export interface EligibilityEntry extends NormalizedRecipient {
  channel: string;
  eligible: boolean;
  skipReason: string | null;
}

export interface EligibilitySummary {
  selected: number;
  eligible: number;
  unsubscribed: number;
  missingEmail: number;
  missingPhone: number;
  smsNotOptedIn: number;
  entries: EligibilityEntry[];
}

export interface RecipientRow {
  userId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  status: string;
  skipReason?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
}

export interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
  contentId?: string;
  isInline?: boolean;
}

export interface CommunicationUser {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  plan: string | null;
  organizationId: string | null;
  organizationName: string | null;
  isSubscribed: boolean;
  isExternal: boolean;
}
