import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../services/api';
import type { AppUser } from '../../types';

type TutorialContextValue = {
  isActive: boolean;
  demoMode: boolean;
  currentStepId: string | null;
  hasAutoStarted: boolean;
  startTour: (options?: { replay?: boolean }) => void;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  cancelTour: () => void;
  markAutoStarted: () => void;
  setCurrentStepId: (id: string | null) => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({
  children,
  user,
  onComplete
}: {
  children: ReactNode;
  user?: AppUser | null;
  onComplete?: (user: AppUser) => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  const [isReplay, setIsReplay] = useState(false);
  const completingRef = useRef(false);

  const applyLocalCompletion = useCallback(() => {
    if (!user) return;
    onComplete?.({
      ...user,
      dashboardTutorialCompletedAt: new Date().toISOString()
    });
  }, [onComplete, user]);

  const persistCompletion = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      const result = await api<{ user: AppUser }>('/api/tutorial/dashboard/complete', { method: 'POST' });
      onComplete?.(result.user);
    } catch {
      applyLocalCompletion();
    } finally {
      completingRef.current = false;
    }
  }, [applyLocalCompletion, onComplete]);

  const cancelTour = useCallback(() => {
    setIsActive(false);
    setCurrentStepId(null);
    setIsReplay(false);
    setHasAutoStarted(false);
  }, []);

  const startTour = useCallback((options?: { replay?: boolean }) => {
    setHasAutoStarted(true);
    setIsReplay(Boolean(options?.replay));
    setIsActive(true);
    setCurrentStepId(null);
  }, []);

  const finishTour = useCallback(
    async (persist: boolean) => {
      const replay = isReplay;
      setIsActive(false);
      setCurrentStepId(null);
      setIsReplay(false);
      if (persist && !replay) {
        await persistCompletion();
      }
    },
    [persistCompletion, isReplay]
  );

  const completeTour = useCallback(async () => {
    await finishTour(true);
  }, [finishTour]);

  const skipTour = useCallback(async () => {
    await finishTour(true);
  }, [finishTour]);

  const markAutoStarted = useCallback(() => {
    setHasAutoStarted(true);
  }, []);

  const value = useMemo(
    () => ({
      isActive,
      demoMode: isActive,
      currentStepId,
      hasAutoStarted,
      startTour,
      completeTour,
      skipTour,
      cancelTour,
      markAutoStarted,
      setCurrentStepId
    }),
    [isActive, currentStepId, hasAutoStarted, startTour, completeTour, skipTour, cancelTour, markAutoStarted]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return context;
}
