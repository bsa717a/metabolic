import { api } from './api';
import { getIdToken } from './auth';
import type { CommunicationUser, EligibilitySummary, RecipientInput } from '../lib/communications/types';

/**
 * Browser API client for the Message Center. Talks to the admin
 * `/api/admin/communications/*` endpoints using Metabolic's shared `api()`
 * helper (Firebase-token auth + `VITE_API_URL` prefixing).
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/** Unlayer embed script proxied by the server (see UnlayerEmailEditor). */
export const UNLAYER_EMBED_URL = `${API_URL}/api/admin/communications/unlayer-embed`;

/**
 * `api()` collapses failed-response bodies into a plain `Error(message)`, but
 * the preview/send endpoints attach a partial `EligibilitySummary` on 400
 * responses (e.g. "no eligible recipients") that the UI needs to render. This
 * thin wrapper mirrors `api()`'s auth/URL handling but preserves that payload.
 */
class CommunicationsApiError extends Error {
  summary?: EligibilitySummary;
  constructor(message: string, summary?: EligibilitySummary) {
    super(message);
    this.name = 'CommunicationsApiError';
    this.summary = summary;
  }
}

async function postWithSummary<T>(path: string, body: unknown): Promise<T> {
  const token = await getIdToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CommunicationsApiError(data?.error || 'Request failed', data?.summary);
  }
  return data as T;
}

export interface CategoryOption {
  value: string;
  label: string;
  allowsUnsubscribe: boolean;
}

export const fetchCategories = () =>
  api<{ categories: CategoryOption[] }>('/api/admin/communications/categories').then((d) => d.categories);

export const searchRecipients = (query: string) =>
  api<{ results: CommunicationUser[] }>(`/api/admin/communications/recipients/search?q=${encodeURIComponent(query)}`).then(
    (d) => d.results
  );

export interface UserFilterParams {
  q?: string;
  role?: string;
  status?: string;
  plan?: string;
  organizationId?: string;
  subscription?: string;
  limit?: number;
  offset?: number;
}

const toQuery = (params: Record<string, unknown> | UserFilterParams): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

export interface OrgOption {
  id: string;
  name: string;
}

export interface FilterOptions {
  organizations: OrgOption[];
  roles: string[];
  plans: string[];
  statuses: string[];
}

/** Organization / role / plan / status options for the Users tab filters. */
export const fetchFilterOptions = () => api<FilterOptions>('/api/admin/communications/filter-options');

export const fetchCommunicationUsers = (params: UserFilterParams = {}) =>
  api<{ users: CommunicationUser[]; total: number }>(`/api/admin/communications/users${toQuery(params)}`);

export const fetchAllCommunicationUsers = (params: UserFilterParams = {}) =>
  api<{ recipients: RecipientInput[]; total: number; truncated: boolean }>(
    `/api/admin/communications/users/all${toQuery(params)}`
  );

export interface CommunicationPayload {
  subject?: string | null;
  body: string;
  bodyDesign?: unknown;
  channel: string;
  category: string;
  recipients: RecipientInput[];
}

export interface RecipientRecord {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  sentAt: string | null;
}

export interface DraftRecord {
  id: string;
  subject: string | null;
  body: string;
  bodyDesign: unknown;
  channel: string;
  category: string;
  status: string;
  recipientsJson: unknown;
  updatedAt: string | null;
  sentAt: string | null;
  createdAt?: string | null;
  recipients?: RecipientRecord[];
}

export interface TemplateRecord {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  bodyDesign: unknown;
  channel: string;
  category: string;
}

export const fetchDrafts = () => api<{ drafts: DraftRecord[] }>('/api/admin/communications/drafts').then((d) => d.drafts);

export const createDraft = (payload: CommunicationPayload) =>
  api<{ draft: DraftRecord }>('/api/admin/communications/drafts', {
    method: 'POST',
    body: JSON.stringify(payload)
  }).then((d) => d.draft);

export const updateDraft = (id: string, payload: CommunicationPayload) =>
  api<{ draft: DraftRecord }>(`/api/admin/communications/drafts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }).then((d) => d.draft);

export const deleteDraft = (id: string) =>
  api<{ success: boolean }>(`/api/admin/communications/drafts/${id}`, { method: 'DELETE' });

export const fetchTemplates = () =>
  api<{ templates: TemplateRecord[] }>('/api/admin/communications/templates').then((d) => d.templates);

export const createTemplate = (payload: Partial<TemplateRecord>) =>
  api<{ template: TemplateRecord }>('/api/admin/communications/templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  }).then((d) => d.template);

export const updateTemplate = (id: string, payload: Partial<TemplateRecord>) =>
  api<{ template: TemplateRecord }>(`/api/admin/communications/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }).then((d) => d.template);

export const deleteTemplate = (id: string) =>
  api<{ success: boolean }>(`/api/admin/communications/templates/${id}`, { method: 'DELETE' });

export const previewEligibility = (payload: CommunicationPayload) =>
  postWithSummary<{ summary: EligibilitySummary }>('/api/admin/communications/preview', payload).then((d) => d.summary);

export interface SendResult {
  communication: DraftRecord;
  summary: EligibilitySummary & { sent: number; failed: number; skipped: number };
  recipients: RecipientRecord[];
}

export const sendCommunication = (payload: CommunicationPayload, draftId: string | null = null) =>
  postWithSummary<SendResult>(
    draftId ? `/api/admin/communications/${draftId}/send` : '/api/admin/communications/send',
    payload
  );

export const fetchSentHistory = () => api<{ sent: DraftRecord[] }>('/api/admin/communications/sent').then((d) => d.sent);

export const fetchSentById = (id: string) =>
  api<{ communication: DraftRecord }>(`/api/admin/communications/sent/${id}`).then((d) => d.communication);

export interface AiEmailGenerateInput {
  prompt: string;
  existingSubject?: string;
  existingHtml?: string;
  category?: string;
}

export interface AiEmailGenerateResult {
  subject: string;
  html: string;
  imageError?: string;
}

/** Generate or refine an email with AI (subject + HTML). */
export const generateCommunicationEmail = (input: AiEmailGenerateInput) =>
  api<AiEmailGenerateResult>('/api/admin/communications/ai/generate', {
    method: 'POST',
    body: JSON.stringify(input)
  });

/** Upload an image for use in an email; returns a stable proxy URL. */
export const uploadCommunicationAsset = async (file: File | Blob): Promise<string> => {
  const token = await getIdToken();
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_URL}/api/admin/communications/assets`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Failed to upload image');
  }
  return data.url as string;
};

export { CommunicationsApiError };
