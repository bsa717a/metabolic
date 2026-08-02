/** Broadcast so chrome (e.g. topbar) can refresh after journey mutations. */
export const GUIDED_JOURNEY_UPDATED_EVENT = 'guided-journey-updated';

export function notifyGuidedJourneyUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GUIDED_JOURNEY_UPDATED_EVENT));
}
