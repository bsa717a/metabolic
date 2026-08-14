import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AppUser } from '../../types';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { coachFabBottom } from '../../utils/floatingActionLayout';
import { useDashboardLayout } from '../../utils/dashboardLayoutPreference';
import { CoachChatModal } from './CoachChatModal';
import { COACH_CHAT_QUICK_REPLIES } from './coachWelcomeMessage';

export function CoachChatFab({ user }: { user?: AppUser | null }) {
  const location = useLocation();
  const [dashboardLayout] = useDashboardLayout();
  const [open, setOpen] = useState(false);
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const coach = getVirtualCoach(user?.selectedVirtualCoachId);
  const hideOnCoachHome = dashboardLayout === 'coachHome' && location.pathname === '/';

  if (!coach || location.pathname.startsWith('/virtual-coach') || hideOnCoachHome) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Message ${coach.name}`}
        onClick={() => {
          setChatSessionKey((key) => key + 1);
          setOpen(true);
        }}
        style={{
          bottom: coachFabBottom(),
          borderColor: coach.accent
        }}
        className="fixed right-6 z-40 hidden size-[6.5625rem] overflow-hidden rounded-full border-2 bg-app-surface shadow-lg transition hover:scale-105 hover:shadow-xl sm:block"
      >
        <img
          src={coach.image}
          alt={coach.name}
          className="h-full w-full object-cover"
          style={{ objectPosition: '50% 18%' }}
        />
      </button>

      <CoachChatModal
        open={open}
        coach={coach}
        autoGreeting
        userFirstName={user?.firstName}
        chatSessionKey={chatSessionKey}
        quickReplies={[...COACH_CHAT_QUICK_REPLIES]}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
