/**
 * Shared types for the Message Center (communications) feature.
 *
 * Field names are camelCase to match the Prisma schema / JSON API contract
 * used across the Metabolic client (see communicationsApi.ts).
 */

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
  sentAt?: string | null;
}

export interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
  contentId?: string;
  isInline?: boolean;
}

/** A user (or external contact) eligible to receive communications. */
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
