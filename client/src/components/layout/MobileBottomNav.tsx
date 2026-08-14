import { Apple, Dumbbell, Gauge, LineChart } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const TABS = [
  { to: '/', label: 'Home', icon: Gauge, end: true },
  { to: '/nutrition', label: 'Nutrition', icon: Apple, end: false },
  { to: '/exercise', label: 'Exercise', icon: Dumbbell, end: false },
  { to: '/progress', label: 'Progress', icon: LineChart, end: false }
] as const;

/** Reserved height of the mobile tab bar, including the home-indicator inset. */
export const MOBILE_BOTTOM_NAV_RESERVE = 'calc(4rem + env(safe-area-inset-bottom))';

export function MobileBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-app-border bg-app-surface/95 backdrop-blur sm:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition',
                  isActive
                    ? 'text-brand-green dark:text-brand-green-light'
                    : 'text-app-text-muted hover:text-app-text'
                )
              }
            >
              <Icon size={22} aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
