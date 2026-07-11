import type { MealPrepBatch, MealPrepFreshIngredient, MealPrepPlanResult } from '../types';

export function formatPrepQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '');
}

export function pluralizePrepUnit(unit: string, quantity: number) {
  if (quantity === 1) return unit;
  if (unit.endsWith('s')) return unit;
  if (unit === 'serving') return 'servings';
  return `${unit}s`;
}

/** "2026-07-13" → "Mon 7/13" for labeling containers. */
export function formatPrepDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatContainerCount(batch: MealPrepBatch) {
  return batch.occurrenceCount === 1 ? '1 container' : `${batch.occurrenceCount} containers`;
}

export function formatFreshServingScope(item: MealPrepFreshIngredient, batch: MealPrepBatch) {
  if (item.servingCount >= batch.occurrenceCount) return '';
  const dates = item.dates.map(formatPrepDate).join(', ');
  return ` — ${item.servingCount} of ${batch.occurrenceCount} servings${dates ? ` (${dates})` : ''}`;
}

function formatRangeLabel(result: MealPrepPlanResult) {
  if (result.startDate === result.endDate) return result.startDate;
  return `${result.startDate} to ${result.endDate}`;
}

export function formatMealPrepForShare(result: MealPrepPlanResult) {
  const lines = ['Meal prep plan', formatRangeLabel(result), ''];

  for (const batch of result.batches) {
    lines.push(`${batch.label} × ${batch.occurrenceCount} (${batch.container})`);
    lines.push(`Label: ${batch.dates.map(formatPrepDate).join(', ')}`);
    const prepVerb = batch.prepStyle === 'assemble' ? 'Mix' : 'Cook';
    for (const item of batch.cookNow) {
      lines.push(`☐ ${prepVerb} ${formatPrepQuantity(item.totalQuantity)} ${pluralizePrepUnit(item.unit, item.totalQuantity)} ${item.name}`);
    }
    for (const item of batch.addFresh) {
      lines.push(
        `+ Add fresh at serving: ${formatPrepQuantity(item.quantityPerServing)} ${pluralizePrepUnit(item.unit, item.quantityPerServing)} ${item.name}${formatFreshServingScope(item, batch)}`
      );
    }
    if (batch.reheat) lines.push(`Reheat: ${batch.reheat}`);
    if (batch.storageNote) lines.push(`Storage: ${batch.storageNote}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

export async function shareMealPrep(result: MealPrepPlanResult) {
  const text = formatMealPrepForShare(result);

  if (typeof navigator.share === 'function') {
    await navigator.share({ title: 'Meal prep plan', text });
    return;
  }

  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    return;
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
