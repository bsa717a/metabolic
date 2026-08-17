const HOME_EQUIPMENT =
  /\b(dumbbells?|dumbells?|kettlebells?|bands?|resistance\s+bands?|bodyweight|physioballs?|stability\s+balls?|swiss\s+balls?)\b/i;

const GYM_PATTERNS = [
  /\bmachines?\b/i,
  /\bcables?\b/i,
  /\bsmith\b/i,
  /\blat\s+pull[-\s]?downs?\b/i,
  /\bleg\s+press(es)?\b/i,
  /\bhack\s+squats?\b/i,
  /\bpec[-\s]?decks?\b/i,
  /\bseated\s+rows?\b/i,
  /\bchest\s+press(es)?\b/i,
  /\bhip\s+abductors?\b/i,
  /\bhip\s+adductors?\b/i,
  /\bassisted\s+(dips?|pull[-\s]?ups?)\b/i,
  /\bpreacher\b.*\bmachine\b/i,
  /\bleg\s+extensions?\b/i,
  /\bleg\s+curls?\b/i
];

export function nameLooksLikeGymOnly(name: string): boolean {
  const text = name.trim();
  if (!text) return false;
  if (HOME_EQUIPMENT.test(text)) return false;
  return GYM_PATTERNS.some((pattern) => pattern.test(text));
}
