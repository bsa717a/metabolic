import { useState } from 'react';
import { Apple, Dumbbell, Gauge, LineChart, Sparkles } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import type { AppUser } from '../../types';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { CoachChatModal } from '../virtualCoach/CoachChatModal';
import { COACH_CHAT_QUICK_REPLIES } from '../virtualCoach/coachWelcomeMessage';

const TABS = [
  { to: '/', label: 'Home', icon: Gauge, end: true },
  { to: '/nutrition', label: 'Nutrition', icon: Apple, end: false },
  { to: '/exercise', label: 'Exercise', icon: Dumbbell, end: false },
  { to: '/progress', label: 'Progress', icon: LineChart, end: false }
] as const;

/** Reserved height of the mobile tab bar, including the home-indicator inset. */
export const MOBILE_BOTTOM_NAV_RESERVE = 'calc(4rem + env(safe-area-inset-bottom))';

export function MobileBottomNav({ user }: { user?: AppUser | null }) {
  const navigate = useNavigate();
  const coach = getVirtualCoach(user?.selectedVirtualCoachId);
  const [open, setOpen] = useState(false);
  const [chatSessionKey, setChatSessionKey] = useState(0);

  function openCoach() {
    if (!coach) {
      navigate('/virtual-coach/choose');
      return;
    }
    setChatSessionKey((key) => key + 1);
    setOpen(true);
  }

  return (
    <>
    <nav
      className="z-30 flex shrink-0 border-t border-app-border bg-app-surface/95 backdrop-blur sm:hidden"
      aria-label="Primary"
    >
      <ul className="grid w-full grid-cols-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
        <li>
          <button
            type="button"
            onClick={openCoach}
            aria-label={coach ? `Message ${coach.name}` : 'Choose a coach'}
            className="relative z-10 flex min-h-11 w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-app-text-muted"
          >
            {coach ? (
              <span
                className="size-8 overflow-hidden rounded-full border-2 bg-app-muted"
                style={{ borderColor: coach.accent }}
              >
                <img
                  src={coach.heroImage}
                  alt=""
                  className="h-full w-full object-cover object-[center_18%]"
                />
              </span>
            ) : (
              <span className="grid size-8 place-items-center rounded-full border border-dashed border-app-border bg-app-muted">
                <Sparkles size={16} aria-hidden />
              </span>
            )}
            {coach ? coach.name : 'Coach'}
          </button>
        </li>
      </ul>
    </nav>
      {coach ? (
        <CoachChatModal
          open={open}
          coach={coach}
          autoGreeting
          userFirstName={user?.firstName}
          chatSessionKey={chatSessionKey}
          quickReplies={[...COACH_CHAT_QUICK_REPLIES]}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
