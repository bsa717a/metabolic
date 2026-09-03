import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Topbar } from './Topbar';
import { MOBILE_BOTTOM_NAV_RESERVE, MobileBottomNav } from './MobileBottomNav';
import type { AppUser } from '../../types';
import { EntitlementsProvider } from '../../context/EntitlementsContext';
import { TutorialProvider } from '../tutorial/TutorialContext';
import { DashboardTutorial } from '../tutorial/DashboardTutorial';
import { SmsRemindersIntroModal } from '../sms/SmsRemindersIntroModal';
import { FeedbackWidget } from '../feedback/FeedbackWidget';
import { CoachChatFab } from '../virtualCoach/CoachChatFab';
import { CoachWelcomeGate } from '../virtualCoach/CoachWelcomeGate';
import { recordNavigation } from '../../services/diagnostics';

export function AppShell({
  user,
  onTutorialComplete,
  onUserUpdated
}: {
  user?: AppUser | null;
  onTutorialComplete?: (user: AppUser) => void;
  onUserUpdated?: (user: AppUser) => void;
}) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [coachIntroRequest, setCoachIntroRequest] = useState(0);

  useEffect(() => {
    recordNavigation(location.pathname);
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    function syncMobileLayout() {
      document.documentElement.style.setProperty(
        '--app-mobile-home-bar-height',
        media.matches ? MOBILE_BOTTOM_NAV_RESERVE : '0px'
      );
    }
    syncMobileLayout();
    media.addEventListener('change', syncMobileLayout);
    return () => {
      media.removeEventListener('change', syncMobileLayout);
      document.documentElement.style.setProperty('--app-mobile-home-bar-height', '0px');
    };
  }, []);

  return (
    <EntitlementsProvider user={user ?? null}>
    <TutorialProvider user={user} onComplete={onTutorialComplete}>
      <div className="flex min-h-dvh flex-col bg-app-bg transition-colors duration-200 max-sm:h-dvh max-sm:overflow-hidden">
        <Topbar
          user={user}
          onOpenCoachIntro={() => setCoachIntroRequest((count) => count + 1)}
          onUserUpdated={onUserUpdated}
        />
        <main
          ref={mainRef}
          className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto p-4 sm:overflow-visible sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
        <MobileBottomNav user={user} />
        <SmsRemindersIntroModal user={user} onComplete={onTutorialComplete} />
        <DashboardTutorial />
        <CoachWelcomeGate
          user={user}
          onComplete={onTutorialComplete}
          introRequest={coachIntroRequest}
        />
        <CoachChatFab user={user} />
        <FeedbackWidget />
      </div>
    </TutorialProvider>
    </EntitlementsProvider>
  );
}
