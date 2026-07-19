/**
 * Canonical merge variables available in Message Center email bodies and
 * subjects. These tokens are substituted per-recipient at send time.
 *
 * Keep this list in sync with the server-side list used at send time.
 */

export interface CommunicationVariable {
  key: string;
  token: string;
  label: string;
  description: string;
  sample: string;
}

export const COMMUNICATION_VARIABLES: CommunicationVariable[] = [
  {
    key: 'recipient_name',
    token: '{{recipient_name}}',
    label: 'Recipient name',
    description: "The recipient's display name (falls back to \u201cthere\u201d).",
    sample: 'Jordan Smith'
  },
  {
    key: 'recipient_email',
    token: '{{recipient_email}}',
    label: 'Recipient email',
    description: "The recipient's email address.",
    sample: 'jordan@example.com'
  },
  {
    key: 'recipient_phone',
    token: '{{recipient_phone}}',
    label: 'Recipient phone',
    description: "The recipient's phone number, when available.",
    sample: '(555) 555-0123'
  },
  {
    key: 'unsubscribe_url',
    token: '{{unsubscribe_url}}',
    label: 'Unsubscribe link',
    description: 'Personalized unsubscribe URL for this recipient.',
    sample: 'https://app.metabolic.example/unsubscribe?token=\u2026'
  },
  {
    key: 'organization',
    token: '{{organization}}',
    label: 'Organization',
    description: 'Your organization name.',
    sample: 'Metabolic OS'
  },
  {
    key: 'current_year',
    token: '{{current_year}}',
    label: 'Current year',
    description: 'The current calendar year.',
    sample: String(new Date().getFullYear())
  }
];

/** Unlayer mergeTags config built from the canonical variable list. */
export const UNLAYER_MERGE_TAGS: Record<string, { name: string; value: string }> =
  COMMUNICATION_VARIABLES.reduce(
    (acc, v) => {
      acc[v.key] = { name: v.label, value: v.token };
      return acc;
    },
    {} as Record<string, { name: string; value: string }>
  );

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Replace {{variable}} tokens with values from context. Whitespace inside the
 * braces is tolerated, matching is case-insensitive on the key.
 */
export const applyCommunicationVariables = (
  text: string | null | undefined,
  context: Record<string, unknown> = {},
  options: { escape?: boolean } = {}
): string => {
  if (text == null || text === '') return text ?? '';
  const { escape = false } = options;
  let output = String(text);

  COMMUNICATION_VARIABLES.forEach(({ key }) => {
    const rawValue = context[key] != null ? String(context[key]) : '';
    const value = escape ? escapeHtml(rawValue) : rawValue;
    output = output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value);
  });

  return output;
};
