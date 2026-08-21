/** Shared value across items, or null when they differ / the list is empty. */
export function sharedField<T>(
  items: T[],
  pick: (item: T) => string | number | null | undefined
): string | number | null {
  if (!items.length) return null;
  const first = pick(items[0]) ?? null;
  return items.every((item) => (pick(item) ?? null) === first) ? first : null;
}
