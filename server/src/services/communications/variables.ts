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
    description: 'The recipient\'s display name (falls back to "there").',
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
    sample: 'https://app.example.com/unsubscribe?token=\u2026'
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

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
