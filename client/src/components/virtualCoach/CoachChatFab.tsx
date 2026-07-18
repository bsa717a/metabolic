import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AppUser } from '../../types';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { coachFabBottom } from '../../utils/floatingActionLayout';
import { CoachChatModal } from './CoachChatModal';
import { COACH_CHAT_QUICK_REPLIES } from './coachWelcomeMessage';

export function CoachChatFab({
  user,
  nutritionMobileLayout
}: {
  user?: AppUser | null;
  nutritionMobileLayout: boolean;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const coach = getVirtualCoach(user?.selectedVirtualCoachId);

  if (!coach || location.pathname.startsWith('/virtual-coach')) {
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
          bottom: coachFabBottom(nutritionMobileLayout),
          borderColor: coach.accent
        }}
        className="fixed right-5 z-40 h-[6.5625rem] w-[6.5625rem] overflow-hidden rounded-full border-2 bg-app-surface shadow-lg transition hover:scale-105 hover:shadow-xl sm:right-6"
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
