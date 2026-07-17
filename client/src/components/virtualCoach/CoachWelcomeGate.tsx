import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppUser, Dashboard } from '../../types';
import { api } from '../../services/api';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { CoachChatModal } from './CoachChatModal';
import {
  buildCoachWelcomeMessage,
  COACH_WELCOME_QUICK_REPLIES,
  coachWelcomeGoalsFromMetrics,
  DEFER_COACH_WELCOME_COMPLETE,
  type CoachWelcomeGoals
} from './coachWelcomeMessage';
import { clearPendingCoachWelcome, readPendingCoachWelcome } from './coachWelcomePending';

type SetupNavigationState = {
  showCoachWelcome?: boolean;
  coachId?: string;
  welcomeGoals?: CoachWelcomeGoals;
};

type WelcomeSession = {
  coachId: string;
  message: string;
};

async function loadWelcomeSession(
  user: AppUser,
  coachId: string,
  goals?: CoachWelcomeGoals
): Promise<WelcomeSession | null> {
  const coach = getVirtualCoach(coachId);
  if (!coach) return null;

  let resolvedGoals = goals;
  if (!resolvedGoals) {
    try {
      const dashboard = await api<Dashboard>('/api/dashboard/today');
      if (dashboard.program?.metrics?.length) {
        resolvedGoals = coachWelcomeGoalsFromMetrics(dashboard.program.metrics);
      }
    } catch {
      // Welcome still opens without goal details.
    }
  }

  return {
    coachId,
    message: buildCoachWelcomeMessage(coach, user.firstName, resolvedGoals)
  };
}

export function CoachWelcomeGate({
  user,
  onComplete,
  introRequest = 0
}: {
  user?: AppUser | null;
  onComplete?: (user: AppUser) => void;
  introRequest?: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [welcomeSession, setWelcomeSession] = useState<WelcomeSession | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const launchedRef = useRef(false);
  const launchInFlightRef = useRef(false);
  const completedRef = useRef(false);
  const lastIntroRequestRef = useRef(0);

  const openWelcome = useCallback(
    async (coachId: string, goals?: CoachWelcomeGoals) => {
      if (!user) return;
      const session = await loadWelcomeSession(user, coachId, goals);
      if (!session) return;
      setSessionKey((key) => key + 1);
      setWelcomeSession(session);
    },
    [user]
  );

  useEffect(() => {
    if (launchedRef.current || launchInFlightRef.current || welcomeSession) return;
    if (!user || user.coachWelcomeCompletedAt) return;
    if (location.pathname !== '/') return;

    const navState = location.state as SetupNavigationState | null;
    const pending = readPendingCoachWelcome();
    const coachId = pending?.coachId ?? navState?.coachId ?? user.selectedVirtualCoachId ?? null;
    const coach = coachId ? getVirtualCoach(coachId) : undefined;

    if (!coach) return;

    const shouldWelcome = Boolean(pending || navState?.showCoachWelcome || user.selectedVirtualCoachId);
    if (!shouldWelcome) return;

    launchInFlightRef.current = true;

    void (async () => {
      try {
        const goals = pending?.welcomeGoals ?? navState?.welcomeGoals;
        const session = await loadWelcomeSession(user, coachId!, goals);
        if (!session) return;

        launchedRef.current = true;
        clearPendingCoachWelcome();
        setSessionKey((key) => key + 1);
        setWelcomeSession(session);

        if (navState?.showCoachWelcome) {
          navigate(location.pathname, { replace: true, state: {} });
        }
      } finally {
        launchInFlightRef.current = false;
      }
    })();
  }, [
    location.pathname,
    location.state,
    navigate,
    openWelcome,
    user?.coachWelcomeCompletedAt,
    user?.firstName,
    user?.id,
    user?.selectedVirtualCoachId,
    welcomeSession
  ]);

  useEffect(() => {
    if (!introRequest || introRequest === lastIntroRequestRef.current) return;
    lastIntroRequestRef.current = introRequest;
    if (!user?.selectedVirtualCoachId) return;
    void openWelcome(user.selectedVirtualCoachId);
  }, [introRequest, openWelcome, user?.selectedVirtualCoachId]);

  const coach = welcomeSession ? getVirtualCoach(welcomeSession.coachId) : undefined;

  async function persistWelcomeComplete() {
    if (!user || completedRef.current || user.coachWelcomeCompletedAt) return;
    completedRef.current = true;
    try {
      const result = await api<{ user: AppUser }>('/api/tutorial/coach-welcome/complete', { method: 'POST' });
      onComplete?.(result.user);
    } catch {
      onComplete?.({ ...user, coachWelcomeCompletedAt: new Date().toISOString() });
    }
  }

  async function handleClose() {
    setWelcomeSession(null);
    await persistWelcomeComplete();
  }

  async function handleUserMessage() {
    if (!DEFER_COACH_WELCOME_COMPLETE) {
      await persistWelcomeComplete();
    }
  }

  if (!coach || !welcomeSession) return null;

  return (
    <CoachChatModal
      key={sessionKey}
      open
      coach={coach}
      closeOnBackdropClick={false}
      chatSessionKey={sessionKey}
      initialMessages={[{ role: 'assistant', content: welcomeSession.message }]}
      quickReplies={[...COACH_WELCOME_QUICK_REPLIES]}
      onClose={() => void handleClose()}
      onUserMessage={() => void handleUserMessage()}
    />
  );
}
