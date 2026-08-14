import { useEffect, useState } from 'react';

export type DashboardLayout = 'classic' | 'coachHome';

export const DASHBOARD_LAYOUT_STORAGE_KEY = 'metabolic-dashboard-layout';
export const DASHBOARD_LAYOUT_CHANGED_EVENT = 'dashboard-layout-changed';

export function getDashboardLayout(): DashboardLayout {
  try {
    return localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) === 'coachHome' ? 'coachHome' : 'classic';
  } catch {
    return 'classic';
  }
}

export function setDashboardLayout(layout: DashboardLayout) {
  localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, layout);
  window.dispatchEvent(new Event(DASHBOARD_LAYOUT_CHANGED_EVENT));
}

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
