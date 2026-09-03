import { useEffect, useState } from 'react';
import {
  DASHBOARD_LAYOUT_CHANGED_EVENT,
  getDashboardLayout,
  setDashboardLayout,
  type DashboardLayout
} from './signupDashboardExperience';

export type { DashboardLayout };
export {
  DASHBOARD_LAYOUT_CHANGED_EVENT,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  beginSignupCoachHomeExperience,
  clearSignupDashboardFirstSession,
  dismissClassicDashboardHint,
  getDashboardLayout,
  setDashboardLayout,
  shouldShowClassicDashboardHint,
  SIGNUP_DASHBOARD_FLOW_KEY
} from './signupDashboardExperience';

export function useDashboardLayout(): [DashboardLayout, (layout: DashboardLayout) => void] {
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    typeof window === 'undefined' ? 'classic' : getDashboardLayout()
  );

  useEffect(() => {
    function sync() {
      setLayout(getDashboardLayout());
    }
    window.addEventListener(DASHBOARD_LAYOUT_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DASHBOARD_LAYOUT_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return [layout, setDashboardLayout];
}
