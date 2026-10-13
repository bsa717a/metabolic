import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppUser } from '../types';
import { api } from '../services/api';
import {
  hasAcceptedAiConsent,
  hasDecidedAiConsent,
  syncRuntimeAiConsentFromUser,
  writeLocalAiConsent
} from '../services/aiConsent';
import { AiConsentModal } from '../components/privacy/AiConsentModal';

type AiConsentContextValue = {
  accepted: boolean;
  decided: boolean;
  reviewOpen: boolean;
  openReview: () => void;
  setAccepted: (accepted: boolean) => Promise<void>;
};

const AiConsentContext = createContext<AiConsentContextValue | null>(null);

export function AiConsentProvider({
  user,
  onUserUpdated,
  children
}: {
  user?: AppUser | null;
  onUserUpdated?: (user: AppUser) => void;
  children: ReactNode;
}) {
  const accepted = hasAcceptedAiConsent(user);
  const decided = hasDecidedAiConsent(user);
  syncRuntimeAiConsentFromUser(user);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const firstUseOpen = Boolean(user?.id && !decided);
  const modalOpen = firstUseOpen || reviewOpen;

  const persist = useCallback(
    async (nextAccepted: boolean) => {
      if (!user?.id) return;
      setSaving(true);
      setError('');
      try {
        const result = await api<{ user: AppUser }>('/api/me/ai-consent', {
          method: 'PUT',
          body: JSON.stringify({ accepted: nextAccepted })
        });
        writeLocalAiConsent(user.id, nextAccepted ? 'accepted' : 'declined');
        syncRuntimeAiConsentFromUser(result.user);
        onUserUpdated?.(result.user);
        setReviewOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save AI permission');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [onUserUpdated, user]
  );

  const setAccepted = useCallback(
    async (nextAccepted: boolean) => {
      try {
        await persist(nextAccepted);
      } catch {
        // Modal / settings surfaces the error
      }
    },
    [persist]
  );

  const value = useMemo<AiConsentContextValue>(
    () => ({
      accepted,
      decided,
      reviewOpen: modalOpen,
      openReview: () => setReviewOpen(true),
      setAccepted
    }),
    [accepted, decided, modalOpen, setAccepted]
  );

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      <AiConsentModal
        open={modalOpen}
        saving={saving}
        error={error}
        dismissible={decided}
        onAccept={() => {
          void setAccepted(true);
        }}
        onDecline={() => {
          void setAccepted(false);
        }}
        onClose={() => setReviewOpen(false)}
      />
    </AiConsentContext.Provider>
  );
}

export function useAiConsent() {
  const context = useContext(AiConsentContext);
  if (!context) {
    return {
      accepted: false,
      decided: false,
      reviewOpen: false,
      openReview: () => undefined,
      setAccepted: async () => undefined
    };
  }
  return context;
}
