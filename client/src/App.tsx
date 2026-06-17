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
import { ExercisePage } from './pages/ExercisePage';
import { ProgressPage } from './pages/ProgressPage';
import { AssistantPage } from './pages/AssistantPage';
import { AdminPage } from './pages/AdminPage';
import { AdminNutritionTemplatesPage } from './pages/AdminNutritionTemplatesPage';
import { AdminNutritionTemplateEditorPage } from './pages/AdminNutritionTemplateEditorPage';
import { AdminExerciseTemplatesPage } from './pages/AdminExerciseTemplatesPage';
import { AdminExerciseTemplateEditorPage } from './pages/AdminExerciseTemplateEditorPage';
import { CoachPage } from './pages/CoachPage';
import { LoginPage } from './pages/LoginPage';
import { FirstTimeSetupPage } from './pages/FirstTimeSetupPage';
import { CampaignPolicyPage } from './pages/CampaignPolicyPage';
import { CampaignTermsPage } from './pages/CampaignTermsPage';
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
  onComplete
}: {
  firebaseUser: User | null;
  appUser: AppUser | null;
  authChecked: boolean;
  onboardingChecked: boolean;
  needsSetup: boolean;
  onComplete: () => void;
}) {
  if (!authChecked) return <LoadingScreen />;
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
  return <CoachPage />;
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
    await refreshOnboardingStatus();
  }, [refreshOnboardingStatus]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage authenticated={Boolean(firebaseUser)} appUser={appUser} />} />
        <Route path="/sms-opt-in" element={<SmsOptInPage />} />
        <Route path="/campaign-policy" element={<CampaignPolicyPage />} />
        <Route path="/campaign-terms" element={<CampaignTermsPage />} />
        <Route
          path="/setup"
          element={
            <SetupRoute
              firebaseUser={firebaseUser}
              appUser={appUser}
              authChecked={authChecked}
              onboardingChecked={onboardingChecked}
              needsSetup={needsSetup}
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
          <Route path="progress/export" element={<ProgressExportPage />} />
          <Route element={<AppShell user={appUser} />}>
            <Route index element={<DashboardPage user={appUser} />} />
            <Route path="program" element={<ProgramPage />} />
            <Route path="nutrition" element={<NutritionPage />} />
            <Route path="exercise" element={<ExercisePage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="hydration" element={<HydrationPage />} />
            <Route path="level-up" element={<GamificationPage />} />
            <Route path="level-up/journey" element={<JourneyPage />} />
            <Route path="level-up/badges" element={<BadgesPage />} />
            <Route path="level-up/baseline" element={<BaselineSnapshotPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="coach" element={<CoachRoute appUser={appUser} />} />
            <Route path="admin" element={<AdminRoute appUser={appUser} />} />
            <Route path="admin/nutrition-templates" element={<AdminRoute appUser={appUser}><AdminNutritionTemplatesPage /></AdminRoute>} />
            <Route path="admin/nutrition-templates/:id" element={<AdminRoute appUser={appUser}><AdminNutritionTemplateEditorPage /></AdminRoute>} />
            <Route path="admin/exercise-templates" element={<AdminRoute appUser={appUser}><AdminExerciseTemplatesPage /></AdminRoute>} />
            <Route path="admin/exercise-templates/:id" element={<AdminRoute appUser={appUser}><AdminExerciseTemplateEditorPage /></AdminRoute>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
