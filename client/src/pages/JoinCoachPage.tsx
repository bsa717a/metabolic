import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { api } from '../services/api';
import { BrandLogo } from '../components/brand/BrandLogo';
import {
  getPendingCoachInvite,
  setPendingCoachInvite,
  clearPendingCoachInvite
} from '../utils/pendingCoachInvite';
import type { AppUser } from '../types';

type CoachInviteInfo = {
  valid: boolean;
  coachCode: string;
  displayName: string;
};

type JoinCoachPageProps = {
  authenticated: boolean;
  authChecked?: boolean;
  onboardingChecked?: boolean;
  needsSetup?: boolean;
  appUser?: AppUser | null;
  onUserUpdated?: (user: AppUser) => void;
};

export function JoinCoachPage({
  authenticated,
  authChecked = true,
  onboardingChecked = true,
  needsSetup = false,
  appUser,
  onUserUpdated
}: JoinCoachPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const codeFromUrl = searchParams.get('coach') || searchParams.get('code');
  const autoConfirmStarted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [coachInfo, setCoachInfo] = useState<CoachInviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const lookupCoach = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const info = await api<CoachInviteInfo>(`/api/public/coach-invite/${encodeURIComponent(code)}`);
      setCoachInfo(info);
      if (info.valid && info.coachCode) {
        setPendingCoachInvite(info.coachCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find this coach');
      setCoachInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (codeFromUrl) {
      void lookupCoach(codeFromUrl);
    } else {
      const pending = getPendingCoachInvite();
      if (pending) {
        void lookupCoach(pending);
      } else {
        setLoading(false);
        setError('No coach code provided. Ask your coach for an invite link.');
      }
    }
  }, [codeFromUrl, lookupCoach]);

  const confirmInvite = useCallback(async () => {
    if (!coachInfo?.coachCode) return;

    setConfirming(true);
    setError(null);
    try {
      const result = await api<{ success: boolean; coachDisplayName: string }>(
        '/api/me/confirm-coach-invite',
        {
          method: 'POST',
          body: JSON.stringify({ coachCode: coachInfo.coachCode })
        }
      );
      if (result.success) {
        setConfirmed(true);
        clearPendingCoachInvite();
        if (onUserUpdated) {
          try {
            const me = await api<{ user: AppUser }>('/api/me');
            onUserUpdated(me.user);
          } catch {
            // Refresh error is non-fatal
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join coach');
    } finally {
      setConfirming(false);
    }
  }, [coachInfo?.coachCode, onUserUpdated]);

  useEffect(() => {
    if (!authChecked || !authenticated || !onboardingChecked) return;
    if (!coachInfo?.coachCode || loading || confirmed) return;
    if (
      appUser?.coachCode &&
      appUser.coachCode.trim().toUpperCase() === coachInfo.coachCode.trim().toUpperCase()
    ) {
      return;
    }

    if (needsSetup) {
      setPendingCoachInvite(coachInfo.coachCode);
      navigate('/setup', { replace: true });
      return;
    }

    if (autoConfirmStarted.current || confirming) return;
    autoConfirmStarted.current = true;
    void confirmInvite();
  }, [
    authChecked,
    authenticated,
    onboardingChecked,
    needsSetup,
    appUser?.coachCode,
    coachInfo?.coachCode,
    loading,
    confirmed,
    confirming,
    confirmInvite,
    navigate
  ]);

  function handleGoToDashboard() {
    navigate('/', { replace: true });
  }

  function handleSignIn() {
    if (coachInfo?.coachCode) {
      setPendingCoachInvite(coachInfo.coachCode);
    }
    navigate('/login', { state: { returnTo: '/join' } });
  }

  const waitingForSession = !authChecked || (authenticated && !onboardingChecked);
  const isOwnInvite = Boolean(
    appUser?.coachCode &&
      coachInfo?.coachCode &&
      appUser.coachCode.trim().toUpperCase() === coachInfo.coachCode.trim().toUpperCase()
  );
  const redirectingToSetup =
    authenticated && onboardingChecked && needsSetup && Boolean(coachInfo?.coachCode) && !isOwnInvite;

  if (confirmed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
        <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 text-center shadow-lg sm:p-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green/20">
            <CheckCircle className="h-8 w-8 text-brand-green" />
          </div>
          <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">
            You're connected!
          </h1>
          <p className="mt-2 text-app-text-muted">
            You've successfully joined <span className="font-semibold text-app-text">{coachInfo?.displayName}</span>.
            They can now personalize your plan.
          </p>
          <button
            type="button"
            onClick={handleGoToDashboard}
            className="mt-6 w-full rounded-full bg-brand-navy px-6 py-3 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <div className="mb-6">
          <BrandLogo showTagline markSize={44} />
        </div>

        {loading || waitingForSession || redirectingToSetup ? (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
            <p className="mt-3 text-sm text-app-text-muted">
              {loading || !authChecked ? 'Looking up your coach...' : 'Connecting...'}
            </p>
          </div>
        ) : error && !coachInfo ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-app-text">Coach not found</h2>
            <p className="mt-2 text-sm text-app-text-muted">{error}</p>
            <p className="mt-4 text-sm text-app-text-muted">
              Double-check the link from your coach, or{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="font-medium text-brand-green hover:underline"
              >
                sign in
              </button>{' '}
              to enter a code manually.
            </p>
          </div>
        ) : coachInfo ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green/20">
              <UserPlus className="h-8 w-8 text-brand-green" />
            </div>
            <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">
              Join {coachInfo.displayName}
            </h1>
            <p className="mt-2 text-app-text-muted">
              {isOwnInvite ? (
                <>
                  This is the invite for{' '}
                  <span className="font-semibold text-app-text">{coachInfo.displayName}</span>.
                </>
              ) : (
                <>
                  You've been invited to work with{' '}
                  <span className="font-semibold text-app-text">{coachInfo.displayName}</span>.
                  {authenticated
                    ? ' Connecting your accounts so they can personalize your plan.'
                    : ' Sign in to connect and let them personalize your plan.'}
                </>
              )}
            </p>

            {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

            {isOwnInvite ? (
              <p className="mt-6 text-sm text-app-text-muted">
                This is your invite link. Share it with clients so they can connect to you.
              </p>
            ) : authenticated ? (
              <button
                type="button"
                disabled={confirming || !error}
                onClick={() => {
                  autoConfirmStarted.current = true;
                  void confirmInvite();
                }}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
              >
                {confirming || !error ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Confirm and Join
                  </>
                )}
              </button>
            ) : (
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="w-full rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
                >
                  Sign in or Create Account
                </button>
                <p className="text-xs text-app-text-muted">
                  You'll be connected to {coachInfo.displayName} after signing in.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
