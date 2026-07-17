/** Bottom offset for the feedback FAB (above mobile home bar on /nutrition). */
export function feedbackFabBottom(nutritionMobileLayout: boolean) {
  return nutritionMobileLayout
    ? 'calc(5.25rem + env(safe-area-inset-bottom))'
    : 'calc(1.25rem + env(safe-area-inset-bottom))';
}

/** Bottom offset for the coach avatar FAB stacked above the feedback button. */
export function coachFabBottom(nutritionMobileLayout: boolean) {
  const base = nutritionMobileLayout ? '5.25rem' : '1.25rem';
  // Feedback FAB height (3rem) + gap (0.75rem)
  return `calc(${base} + env(safe-area-inset-bottom) + 3.75rem)`;
}
