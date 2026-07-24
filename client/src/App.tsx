import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { listenForAuth } from './services/auth';
import { api } from './services/api';
import type { AppUser } from './types';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ProgramPage } from './pages/ProgramPage';
import { NutritionPage } from './pages/NutritionPage';
import { ExerciseAreaLayout } from './pages/exercise/ExerciseAreaLayout';
import { TodayTab } from './pages/exercise/TodayTab';
import { PlanTab } from './pages/exercise/PlanTab';
import { ManageTab } from './pages/exercise/ManageTab';
import { WorkoutSessionPage } from './pages/WorkoutSessionPage';
import { ProgressPage } from './pages/ProgressPage';
import { AssistantPage } from './pages/AssistantPage';
import { AdminPage } from './pages/AdminPage';
import { AdminNutritionTemplatesPage } from './pages/AdminNutritionTemplatesPage';
import { AdminNutritionTemplateEditorPage } from './pages/AdminNutritionTemplateEditorPage';
import { AdminMealCardSetEditorPage } from './pages/AdminMealCardSetEditorPage';
import { AdminExerciseTemplatesPage } from './pages/AdminExerciseTemplatesPage';
import { AdminExerciseTemplateEditorPage } from './pages/AdminExerciseTemplateEditorPage';
import { AdminCommunicationsPage } from './pages/AdminCommunicationsPage';
import { UnsubscribePage } from './pages/UnsubscribePage';
import { CoachPage } from './pages/CoachPage';
import { VirtualCoachPage } from './pages/VirtualCoachPage';
import { VirtualCoachDetailPage } from './pages/VirtualCoachDetailPage';
import { LoginPage } from './pages/LoginPage';
import { FirstTimeSetupPage } from './pages/FirstTimeSetupPage';
import { CampaignPolicyPage } from './pages/CampaignPolicyPage';
import { CampaignTermsPage } from './pages/CampaignTermsPage';
import { SupportPage } from './pages/SupportPage';
import { SmsOptInPage } from './pages/SmsOptInPage';
import { GamificationPage } from './pages/GamificationPage';
import { JourneyPage } from './pages/JourneyPage';
import { BadgesPage } from './pages/BadgesPage';
import { BaselineSnapshotPage } from './pages/BaselineSnapshotPage';
import { HydrationPage } from './pages/HydrationPage';
import { ExerciseExportPage } from './pages/export/ExerciseExportPage';
import { NutritionExportPage } from './pages/export/NutritionExportPage';
import { ShoppingListExportPage } from './pages/export/ShoppingListExportPage';
import { ProgressExportPage } from './pages/export/ProgressExportPage';
import { PricingPage } from './pages/PricingPage';
import { UpgradePage } from './pages/UpgradePage';
import { StorePage } from './pages/StorePage';
import { isAdminRole, isCoachRole } from './utils/roles';

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text-muted">
      Loading…
    </main>
  );
}

function Protected({
  firebaseUser,
  authChecked,
  onboardingChecked,
  needsSetup
}: {
  firebaseUser: User | null;
  authChecked: boolean;
  onboardingChecked: boolean;
  needsSetup: boolean;
}) {
  if (!authChecked) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!onboardingChecked) return <LoadingScreen />;
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

function SetupRoute({
  firebaseUser,
  appUser,
  authChecked,
  onboardingChecked,
  needsSetup,
  onComplete,
  refreshOnboardingStatus
}: {
  firebaseUser: User | null;
  appUser: AppUser | null;
  authChecked: boolean;
  onboardingChecked: boolean;
  needsSetup: boolean;
  onComplete: () => void;
  refreshOnboardingStatus: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    void refreshOnboardingStatus().finally(() => setRefreshing(false));
  }, [refreshOnboardingStatus]);

  if (!authChecked || refreshing) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!onboardingChecked) return <LoadingScreen />;
  if (!needsSetup) return <Navigate to="/" replace />;
  return <FirstTimeSetupPage user={appUser} onComplete={onComplete} />;
}

function AdminRoute({ appUser, children }: { appUser: AppUser | null; children?: React.ReactNode }) {
  if (!isAdminRole(appUser?.role)) {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-brand-navy dark:text-brand-off-white">
        <h1 className="text-xl font-bold">Admin access required</h1>
        <p className="mt-2 text-sm text-app-text-muted">
          Your account does not have permission to view admin tools. Sign in as{' '}
          <code>admin@metabolic.local</code> to manage users.
        </p>
      </div>
    );
  }
  return children ?? <AdminPage />;
}

function CoachRoute({ appUser }: { appUser: AppUser | null }) {
  if (!isCoachRole(appUser?.role)) {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-brand-navy dark:text-brand-off-white">
        <h1 className="text-xl font-bold">Coach access required</h1>
        <p className="mt-2 text-sm text-app-text-muted">Your account does not have permission to view coach tools.</p>
      </div>
    );
  }
  return <CoachPage coachUserId={appUser!.id} />;
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  const refreshOnboardingStatus = useCallback(async () => {
    try {
      const status = await api<{ needsSetup: boolean }>('/api/onboarding/status');
      setNeedsSetup(status.needsSetup);
    } catch {
      setNeedsSetup(false);
    } finally {
      setOnboardingChecked(true);
    }
  }, []);

  useEffect(
    () =>
      listenForAuth(async (user) => {
        setFirebaseUser(user);
        setAuthChecked(true);
        if (user) {
          try {
            const me = await api<{ user: AppUser }>('/api/me');
            setAppUser(me.user);
            await refreshOnboardingStatus();
          } catch {
            setAppUser(null);
            setNeedsSetup(false);
            setOnboardingChecked(true);
          }
        } else {
          setAppUser(null);
          setNeedsSetup(false);
          setOnboardingChecked(false);
        }
      }),
    [refreshOnboardingStatus]
  );

  const handleSetupComplete = useCallback(async () => {
    setNeedsSetup(false);
    try {
      const me = await api<{ user: AppUser }>('/api/me');
      setAppUser(me.user);
    } catch {
      // Keep existing app user if refresh fails.
    }
    await refreshOnboardingStatus();
  }, [refreshOnboardingStatus]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage authenticated={Boolean(firebaseUser)} appUser={appUser} />} />
        <Route path="/pricing" element={<PricingPage authenticated={Boolean(firebaseUser)} />} />
        <Route path="/sms-opt-in" element={<SmsOptInPage />} />
        <Route path="/campaign-policy" element={<CampaignPolicyPage />} />
        <Route path="/campaign-terms" element={<CampaignTermsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route
          path="/setup"
          element={
            <SetupRoute
              firebaseUser={firebaseUser}
              appUser={appUser}
              authChecked={authChecked}
              onboardingChecked={onboardingChecked}
              needsSetup={needsSetup}
              refreshOnboardingStatus={refreshOnboardingStatus}
              onComplete={() => {
                void handleSetupComplete();
              }}
            />
          }
        />
        <Route
          element={
            <Protected
              firebaseUser={firebaseUser}
              authChecked={authChecked}
              onboardingChecked={onboardingChecked}
              needsSetup={needsSetup}
            />
          }
        >
          <Route path="nutrition/export" element={<NutritionExportPage />} />
          <Route path="nutrition/shopping-list/export" element={<ShoppingListExportPage />} />
          <Route path="exercise/export" element={<ExerciseExportPage />} />
          <Route path="exercise/session" element={<WorkoutSessionPage />} />
          <Route path="progress/export" element={<ProgressExportPage />} />
          <Route element={<AppShell user={appUser} onTutorialComplete={setAppUser} />}>
            <Route path="upgrade" element={<UpgradePage user={appUser} />} />
            <Route path="store" element={<StorePage user={appUser} />} />
            <Route index element={<DashboardPage user={appUser} />} />
            <Route path="program" element={<ProgramPage user={appUser} />} />
            <Route path="nutrition" element={<NutritionPage />} />
            <Route path="exercise" element={<ExerciseAreaLayout />}>
              <Route index element={<TodayTab />} />
              <Route path="plan" element={<PlanTab />} />
              <Route path="manage" element={<ManageTab />} />
            </Route>
            <Route path="progress" element={<ProgressPage />} />
            <Route path="hydration" element={<HydrationPage />} />
            <Route path="level-up" element={<GamificationPage />} />
            <Route path="level-up/journey" element={<JourneyPage />} />
            <Route path="level-up/badges" element={<BadgesPage />} />
            <Route path="level-up/baseline" element={<BaselineSnapshotPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="virtual-coach" element={<VirtualCoachPage user={appUser} />} />
            <Route path="virtual-coach/choose" element={<VirtualCoachPage user={appUser} picker />} />
            <Route
              path="virtual-coach/:coachId"
              element={
                <VirtualCoachDetailPage
                  user={appUser}
                  onSelected={(coachId) =>
                    setAppUser((current) => (current ? { ...current, selectedVirtualCoachId: coachId } : current))
                  }
                />
              }
            />
            <Route path="coach" element={<CoachRoute appUser={appUser} />} />
            <Route path="admin" element={<AdminRoute appUser={appUser} />} />
            <Route path="admin/nutrition-templates" element={<AdminRoute appUser={appUser}><AdminNutritionTemplatesPage /></AdminRoute>} />
            <Route path="admin/nutrition-templates/:id" element={<AdminRoute appUser={appUser}><AdminNutritionTemplateEditorPage /></AdminRoute>} />
            <Route path="admin/meal-cards/:id" element={<AdminRoute appUser={appUser}><AdminMealCardSetEditorPage /></AdminRoute>} />
            <Route path="admin/exercise-templates" element={<AdminRoute appUser={appUser}><AdminExerciseTemplatesPage /></AdminRoute>} />
            <Route path="admin/exercise-templates/:id" element={<AdminRoute appUser={appUser}><AdminExerciseTemplateEditorPage /></AdminRoute>} />
            <Route path="admin/communications" element={<AdminRoute appUser={appUser}><AdminCommunicationsPage /></AdminRoute>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
