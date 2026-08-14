/** Bottom offset for the feedback FAB (above the mobile tab bar). */
export function feedbackFabBottom() {
  return 'calc(1.25rem + var(--app-mobile-home-bar-height))';
}

/** Bottom offset for the coach avatar FAB stacked above the feedback button. */
export function coachFabBottom() {
  // Feedback FAB height (3rem) + gap (0.75rem)
  return 'calc(1.25rem + var(--app-mobile-home-bar-height) + 3.75rem)';
}
