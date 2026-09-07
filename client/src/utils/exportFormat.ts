import { formatDayAbbrev, formatDayNumber, parseDateKey } from '../services/api';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPlannedTime(plannedTime?: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;

  const [, hour, minute] = match;
  return new Date(2000, 0, 1, Number(hour), Number(minute))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

export function formatExportDate(date: string) {
  return parseDateKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function formatShortDayLabel(date: string) {
  return `${formatDayAbbrev(date)} ${formatDayNumber(date)}`;
}

export function formatItemQuantityLine(quantity: number, unit: string, name: string) {
  const qty = Number(quantity);
  const unitLabel = unit?.trim();
  const portion = unitLabel ? `${qty} ${unitLabel}` : `${qty}`;
  return `${portion} ${name}`.trim();
}

export function formatMacroLine(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

export function formatItemMacros(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} kcal · ${Math.round(protein)}g P · ${Math.round(carbs)}g C · ${Math.round(fat)}g F`;
}
