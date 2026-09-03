import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  beginSignupCoachHomeExperience,
  clearSignupDashboardFirstSession,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  dismissClassicDashboardHint,
  getDashboardLayout,
  setDashboardLayout,
  shouldShowClassicDashboardHint,
  SIGNUP_DASHBOARD_FLOW_KEY
} from './signupDashboardExperience';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    clear: () => void map.clear(),
    removeItem: (k: string) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null
  };
}

describe('signup dashboard experience', () => {
  beforeAll(() => {
    const local = makeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: local,
        dispatchEvent: () => true
      },
      configurable: true
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'window');
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('leaves existing users on the classic dashboard', () => {
    expect(getDashboardLayout()).toBe('classic');
    expect(shouldShowClassicDashboardHint()).toBe(false);
  });

  it('preserves an existing Coach Home preference when there is no signup flow', () => {
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, 'coachHome');
    expect(getDashboardLayout()).toBe('coachHome');
    expect(shouldShowClassicDashboardHint()).toBe(false);
  });

  it('lands a new signup on Coach Home for the first login', () => {
    beginSignupCoachHomeExperience();
    expect(getDashboardLayout()).toBe('coachHome');
    expect(shouldShowClassicDashboardHint()).toBe(false);
    expect(localStorage.getItem(SIGNUP_DASHBOARD_FLOW_KEY)).toBe('show-coach-home');
  });

  it('keeps Coach Home across refreshes and extra tabs until logout', () => {
    beginSignupCoachHomeExperience();
    expect(getDashboardLayout()).toBe('coachHome');
    expect(getDashboardLayout()).toBe('coachHome');
    expect(shouldShowClassicDashboardHint()).toBe(false);
  });

  it('switches to classic and shows the hint on the next login', () => {
    beginSignupCoachHomeExperience();
    clearSignupDashboardFirstSession();

    expect(getDashboardLayout()).toBe('classic');
    expect(shouldShowClassicDashboardHint()).toBe(true);
    expect(localStorage.getItem(SIGNUP_DASHBOARD_FLOW_KEY)).toBe('show-classic-hint');
  });

  it('hides the hint after dismiss', () => {
    beginSignupCoachHomeExperience();
    clearSignupDashboardFirstSession();
    expect(shouldShowClassicDashboardHint()).toBe(true);

    dismissClassicDashboardHint();
    expect(shouldShowClassicDashboardHint()).toBe(false);
    expect(localStorage.getItem(SIGNUP_DASHBOARD_FLOW_KEY)).toBe('done');
  });

  it('dismisses the hint when the user switches to Coach Home', () => {
    beginSignupCoachHomeExperience();
    clearSignupDashboardFirstSession();
    expect(shouldShowClassicDashboardHint()).toBe(true);

    setDashboardLayout('coachHome');
    expect(shouldShowClassicDashboardHint()).toBe(false);
    expect(localStorage.getItem(SIGNUP_DASHBOARD_FLOW_KEY)).toBe('done');
  });
});
