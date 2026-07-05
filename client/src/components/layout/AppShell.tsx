import { Outlet, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useEffect } from 'react';
import { Topbar } from './Topbar';
import { MobileBottomHomeBar } from './MobileBottomHomeBar';
import type { AppUser } from '../../types';
import { EntitlementsProvider } from '../../context/EntitlementsContext';
import { TutorialProvider } from '../tutorial/TutorialContext';
import { DashboardTutorial } from '../tutorial/DashboardTutorial';
import { SmsRemindersIntroModal } from '../sms/SmsRemindersIntroModal';

export function AppShell({
  user,
  onTutorialComplete
}: {
  user?: AppUser | null;
  onTutorialComplete?: (user: AppUser) => void;
}) {
  const location = useLocation();
  const nutritionMobileLayout = location.pathname === '/nutrition';

  useEffect(() => {
    if (!nutritionMobileLayout) {
      document.documentElement.style.setProperty('--app-mobile-home-bar-height', '0px');
      return;
    }
    const media = window.matchMedia('(max-width: 639px)');
    function syncMobileLayout() {
      if (media.matches) {
        document.documentElement.style.setProperty('--app-topbar-height', '0px');
        document.documentElement.style.setProperty(
          '--app-mobile-home-bar-height',
          'calc(4.5rem + env(safe-area-inset-bottom))'
        );
      } else {
        document.documentElement.style.setProperty('--app-mobile-home-bar-height', '0px');
      }
    }
    syncMobileLayout();
    media.addEventListener('change', syncMobileLayout);
    return () => {
      media.removeEventListener('change', syncMobileLayout);
      document.documentElement.style.setProperty('--app-mobile-home-bar-height', '0px');
    };
  }, [nutritionMobileLayout]);

  return (
    <EntitlementsProvider user={user ?? null}>
    <TutorialProvider user={user} onComplete={onTutorialComplete}>
      <div className="min-h-screen bg-app-bg flex flex-col transition-colors duration-200">
        <div className={nutritionMobileLayout ? 'hidden sm:block' : undefined}>
          <Topbar user={user} />
        </div>
        <main
          className={clsx(
            'flex-1 w-full mx-auto max-w-7xl p-4 sm:p-6 lg:p-8',
            nutritionMobileLayout && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-6 lg:pb-8'
          )}
        >
          <Outlet />
        </main>
        {nutritionMobileLayout && <MobileBottomHomeBar />}
        <SmsRemindersIntroModal user={user} onComplete={onTutorialComplete} />
        <DashboardTutorial />
      </div>
    </TutorialProvider>
    </EntitlementsProvider>
  );
}
