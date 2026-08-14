export const OPEN_HYDRATION_DRAWER_EVENT = 'open-hydration-drawer';

export function openHydrationDrawer() {
  window.dispatchEvent(new Event(OPEN_HYDRATION_DRAWER_EVENT));
}
