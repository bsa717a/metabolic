export type DashboardLayout = 'classic' | 'coachHome';

export const DASHBOARD_LAYOUT_STORAGE_KEY = 'metabolic-dashboard-layout';
export const DASHBOARD_LAYOUT_CHANGED_EVENT = 'dashboard-layout-changed';

/** First-login Coach Home, then classic dashboard + hint. */
export const SIGNUP_DASHBOARD_FLOW_KEY = 'metabolic-signup-dashboard-flow';

export type SignupDashboardFlow = 'show-coach-home' | 'show-classic-hint' | 'done';

function readItem(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}

function readFlow(): SignupDashboardFlow | null {
  const value = readItem(localStorage, SIGNUP_DASHBOARD_FLOW_KEY);
  if (value === 'show-coach-home' || value === 'show-classic-hint' || value === 'done') {
    return value;
  }
  return null;
}

export function getDashboardLayout(): DashboardLayout {
  try {
    return localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) === 'coachHome' ? 'coachHome' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setDashboardLayout(layout: DashboardLayout) {
  localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, layout);
  if (layout === 'coachHome') {
    dismissClassicDashboardHint();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DASHBOARD_LAYOUT_CHANGED_EVENT));
  }
}

/** Call when a new user finishes first-time setup so they land on Coach Home once. */
export function beginSignupCoachHomeExperience() {
  writeItem(localStorage, SIGNUP_DASHBOARD_FLOW_KEY, 'show-coach-home');
  setDashboardLayout('coachHome');
}

/** Call on logout so the next login lands on the classic dashboard with the hint. */
export function clearSignupDashboardFirstSession() {
  if (readFlow() !== 'show-coach-home') return;
  writeItem(localStorage, DASHBOARD_LAYOUT_STORAGE_KEY, 'classic');
  writeItem(localStorage, SIGNUP_DASHBOARD_FLOW_KEY, 'show-classic-hint');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DASHBOARD_LAYOUT_CHANGED_EVENT));
  }
}

export function shouldShowClassicDashboardHint(): boolean {
  return readFlow() === 'show-classic-hint';
}

export function dismissClassicDashboardHint() {
  if (readFlow() === 'show-classic-hint') {
    writeItem(localStorage, SIGNUP_DASHBOARD_FLOW_KEY, 'done');
  }
}
