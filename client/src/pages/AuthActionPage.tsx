import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Eye, EyeOff, Mail, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { BrandLogo } from '../components/brand/BrandLogo';
import {
  applyEmailActionCode,
  confirmPasswordResetAction,
  inspectEmailActionCode,
  verifyPasswordResetActionCode
} from '../services/auth';
import {
  formatAuthActionError,
  isAuthActionMode,
  parseAuthActionSearch,
  runAuthActionOnce,
  safeContinuePath
} from '../utils/authAction';

const inputClass =
  'w-full rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-app-text placeholder:text-app-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-green/40';

type PageStatus = 'working' | 'form' | 'success' | 'error';

interface AuthActionPageProps {
  authenticated: boolean;
  onActionComplete?: () => Promise<void>;
}

export function AuthActionPage({ authenticated, onActionComplete }: AuthActionPageProps) {
  const [searchParams] = useSearchParams();
  const { mode, oobCode, continueUrl } = useMemo(() => parseAuthActionSearch(searchParams), [searchParams]);
  const continuePath = safeContinuePath(continueUrl, window.location.origin);
  const [status, setStatus] = useState<PageStatus>('working');
  const [error, setError] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!mode || !oobCode || !isAuthActionMode(mode)) {
        setError('This link is missing information or is not a valid Metabolic OS email link.');
        setStatus('error');
        return;
      }

      if (mode === 'resetPassword') {
        try {
          const email = await runAuthActionOnce(`reset:${oobCode}`, () => verifyPasswordResetActionCode(oobCode));
          if (!cancelled) {
            setAccountEmail(email);
            setStatus('form');
          }
        } catch (err) {
          if (!cancelled) {
            setError(formatAuthActionError(err));
            setStatus('error');
          }
        }
        return;
      }

      try {
        const restoredEmail = await runAuthActionOnce(`${mode}:${oobCode}`, async () => {
          let email = '';
          if (mode === 'recoverEmail') {
            const info = await inspectEmailActionCode(oobCode);
            email = info.data.email ?? '';
          }
          await applyEmailActionCode(oobCode);
          if (onActionComplete) await onActionComplete();
          return email;
        });
        if (!cancelled) {
          if (restoredEmail) setAccountEmail(restoredEmail);
          setStatus('success');
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatAuthActionError(err));
          setStatus('error');
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode, onActionComplete]);

  async function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!oobCode) return;
    setError('');
    if (password.length < 6) {
      setError('Choose a stronger password (at least 6 characters).');
      return;
    }
    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordResetAction(oobCode, password);
      setStatus('success');
    } catch (err) {
      setError(formatAuthActionError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const heading = headingFor(mode, status);
  const body = bodyFor(mode, status, accountEmail);
  const verifiedEmail = status === 'success' && (mode === 'verifyEmail' || mode === 'verifyAndChangeEmail');

  function closeWindow() {
    window.close();
    window.setTimeout(() => setCloseBlocked(true), 150);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <div className="mb-8">
          <BrandLogo showTagline markSize={44} />
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/10">
              {status === 'error' ? (
                <ShieldAlert className="h-6 w-6 text-red-500" />
              ) : status === 'success' ? (
                <CheckCircle className="h-6 w-6 text-brand-green" />
              ) : (
                <Mail className="h-6 w-6 text-brand-green" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">{heading}</h1>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-app-text-muted">{body}</p>
        </div>

        {status === 'working' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-app-text-muted">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Working on it…
          </div>
        )}

        {status === 'form' && (
          <form className="space-y-5" onSubmit={submitNewPassword}>
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-app-text">
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  className={`${inputClass} pr-12`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a new password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-app-text-muted transition hover:text-app-text"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-app-text">
                Confirm password
              </label>
              <input
                id="confirm-password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            >
              {submitting ? 'Saving…' : 'Save new password'}
              {!submitting && <ArrowRight size={16} aria-hidden />}
            </button>
          </form>
        )}

        {status === 'success' && verifiedEmail && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={closeWindow}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            >
              <X size={16} aria-hidden />
              Verified, Close window
            </button>
            {closeBlocked && (
              <p className="text-center text-sm text-app-text-muted">
                {authenticated
                  ? 'This tab is still open. Close it and return to Metabolic OS — it will continue automatically.'
                  : 'This tab is still open. Close it, then sign in to Metabolic OS.'}
              </p>
            )}
          </div>
        )}

        {status === 'success' && !verifiedEmail && (
          <Link
            to={continuePath}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            Sign in
            <ArrowRight size={16} aria-hidden />
          </Link>
        )}

        {status === 'error' && (
          <Link
            to="/login"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            Back to sign in
            <ArrowRight size={16} aria-hidden />
          </Link>
        )}

        {error && status !== 'working' && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}
      </div>

      <p className="mt-8 max-w-md text-center text-sm text-app-text-muted">
        Secure access to your personalized wellness dashboard
      </p>
    </main>
  );
}

function headingFor(mode: string | null, status: PageStatus) {
  if (status === 'error') return 'Link could not be used';
  if (mode === 'resetPassword') {
    return status === 'success' ? 'Password updated' : 'Choose a new password';
  }
  if (mode === 'recoverEmail') {
    return status === 'success' ? 'Email restored' : 'Restoring your email';
  }
  if (mode === 'verifyAndChangeEmail') {
    return status === 'success' ? 'Email updated' : 'Confirming your email';
  }
  if (status === 'success') return 'Email verified';
  return 'Verifying your email';
}

function bodyFor(mode: string | null, status: PageStatus, email: string) {
  if (status === 'error') {
    return 'Request a new email from Metabolic OS if you still need to verify your address or reset your password.';
  }
  if (mode === 'resetPassword') {
    if (status === 'success') return 'Your password has been updated. Sign in with your new password to continue.';
    return email
      ? `Set a new password for ${email}.`
      : 'Set a new password for your Metabolic OS account.';
  }
  if (mode === 'recoverEmail') {
    if (status === 'success') {
      return email
        ? `Your sign-in email was restored to ${email}. If you did not request a change, reset your password next.`
        : 'Your previous email address has been restored.';
    }
    return 'We are restoring the original email on this account.';
  }
  if (status === 'success') {
    return 'You are verified. Close this window and return to Metabolic OS.';
  }
  return 'Hang tight while we confirm this email link.';
}
