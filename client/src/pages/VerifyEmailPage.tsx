import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle, LogOut } from 'lucide-react';
import { BrandLogo } from '../components/brand/BrandLogo';
import { resendVerificationEmail, reloadCurrentUser, logout, getCurrentUserEmail } from '../services/auth';

const RESEND_COOLDOWN_SECONDS = 60;

interface VerifyEmailPageProps {
  emailVerified: boolean;
  authChecked: boolean;
  isAuthenticated: boolean;
  onRefreshVerification?: () => Promise<void>;
}

export function VerifyEmailPage({ emailVerified, authChecked, isAuthenticated, onRefreshVerification }: VerifyEmailPageProps) {
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  if (!authChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text-muted">
        Loading…
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (emailVerified) {
    return <Navigate to="/" replace />;
  }

  async function handleResend() {
    setError('');
    setSuccess('');
    setResending(true);
    try {
      await resendVerificationEmail();
      setSuccess('Verification email sent! Check your inbox (and spam folder).');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof Error && err.message.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send verification email.');
      }
    } finally {
      setResending(false);
    }
  }

  async function handleCheckVerification() {
    setError('');
    setSuccess('');
    setChecking(true);
    try {
      const user = await reloadCurrentUser();
      if (user?.emailVerified) {
        setSuccess('Email verified! Redirecting…');
        if (onRefreshVerification) {
          await onRefreshVerification();
        }
      } else {
        setError('Email not verified yet. Check your inbox and click the verification link.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check verification status.');
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <div className="mb-8">
          <BrandLogo showTagline markSize={44} />
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green/10">
              <Mail className="h-6 w-6 text-brand-green" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">
                Verify your email
              </h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-app-text-muted">
            We sent a verification link to{' '}
            <span className="font-medium text-app-text">{email || 'your email'}</span>. Click the link in
            the email to verify your account.
          </p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleCheckVerification}
            disabled={checking}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            {checking ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                I've verified — continue
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-app-border bg-app-surface px-6 py-3.5 text-sm font-medium text-app-text shadow-sm transition hover:bg-app-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Resend verification email
              </>
            )}
          </button>
        </div>

        {success && (
          <div className="mt-4 rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-sm text-brand-green dark:text-brand-green-light">
            {success}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mt-6 border-t border-app-border pt-6">
          <p className="text-center text-sm text-app-text-muted">
            Didn't receive the email? Check your spam folder or{' '}
            <button
              type="button"
              className="font-medium text-brand-green hover:underline dark:text-brand-green-light"
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
            >
              request a new one
            </button>
            .
          </p>
          <p className="mt-4 text-center text-sm text-app-text-muted">
            Wrong email?{' '}
            <button
              type="button"
              className="font-medium text-brand-green hover:underline dark:text-brand-green-light"
              onClick={handleLogout}
            >
              <LogOut className="mr-1 inline h-3.5 w-3.5" />
              Sign out
            </button>{' '}
            and create a new account.
          </p>
        </div>
      </div>

      <p className="mt-8 max-w-md text-center text-sm text-app-text-muted">
        Email verification helps us reach you with important account updates and ensures your coach can contact
        you.
      </p>
    </main>
  );
}
