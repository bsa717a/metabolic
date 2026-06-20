export function normalizeSetupGender(value?: string | null): 'm' | 'f' | '' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'm';
  if (normalized === 'f' || normalized === 'female') return 'f';
  return '';
}

export function normalizeBirthDateKey(value?: string | null): string {
  if (!value) return '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}
