import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import type { AppUser } from '../../types';
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
  return (
    <TutorialProvider user={user} onComplete={onTutorialComplete}>
      <div className="min-h-screen bg-app-bg flex flex-col transition-colors duration-200">
        <Topbar user={user} />
        <main className="flex-1 w-full mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
        <SmsRemindersIntroModal user={user} onComplete={onTutorialComplete} />
        <DashboardTutorial />
      </div>
    </TutorialProvider>
  );
}
