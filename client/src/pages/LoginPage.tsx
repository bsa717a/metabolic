import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { login, loginWithApple, loginWithGoogle, resetPassword, signUp } from '../services/auth';
import { isFirebaseConfigured } from '../services/firebase';
import { BrandLogo } from '../components/brand/BrandLogo';
import { getPendingCoachInvite, postLoginPath } from '../utils/pendingCoachInvite';
import type { AppUser } from '../types';

const inputClass =
  'w-full rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-app-text placeholder:text-app-text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-green/40';

const LOGIN_WELCOMES = [
  { heading: 'Welcome back', subtitle: 'Small steps today lead to lasting change.' },
  { heading: "You've got this", subtitle: 'Consistency beats perfection — pick up where you left off.' },
  { heading: 'Ready when you are', subtitle: 'Your goals are waiting. One login away.' },
  { heading: 'Good to see you', subtitle: "Progress isn't always visible, but it's always happening." },
  { heading: 'Rise and thrive', subtitle: 'Fuel your body, train your mind, trust the process.' },
  { heading: "Let's go", subtitle: 'Your personalized wellness dashboard is ready for you.' },
  { heading: 'Back at it', subtitle: 'Every healthy choice compounds. Keep building momentum.' },
  { heading: 'Welcome back, champion', subtitle: 'The best project you will ever work on is you.' }
] as const;

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c3.4-3.13 5.338-7.744 5.338-13.216z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="currentColor"
        d="M14.94 14.46c-.45 1.04-.98 1.99-1.59 2.86-.83 1.18-1.51 2-2.04 2.45-.81.75-1.68 1.14-2.6 1.16-.66 0-1.46-.19-2.39-.57-.93-.38-1.78-.57-2.56-.57-.83 0-1.72.19-2.67.57-.95.38-1.72.58-2.3.6-.89.04-1.78-.36-2.67-1.21-.57-.49-1.29-1.33-2.14-2.53-.91-1.28-1.66-2.76-2.25-4.45-.63-1.82-.94-3.59-.94-5.29 0-1.95.42-3.64 1.26-5.05.66-1.13 1.54-2.02 2.64-2.67 1.1-.65 2.29-.98 3.57-1 .7 0 1.62.22 2.76.65 1.13.43 1.86.65 2.18.65.24 0 1.05-.26 2.42-.77 1.3-.47 2.39-.67 3.28-.59 2.43.2 4.25 1.16 5.47 2.9-2.17 1.32-3.25 3.16-3.22 5.53.02 1.85.69 3.38 2 4.6.59.56 1.25 1 1.98 1.31-.16.46-.33.91-.52 1.33zm-5.07-18.07c0 1.45-.53 2.8-1.58 4.06-1.27 1.49-2.8 2.35-4.47 2.21-.02-.18-.03-.37-.03-.57 0-1.39.61-2.88 1.69-4.1.54-.62 1.23-1.13 2.06-1.54.83-.4 1.61-.62 2.35-.66.02.2.03.4.03.6z"
        transform="scale(0.82) translate(1, 1)"
      />
    </svg>
  );
}

type AuthMode = 'login' | 'signup' | 'reset';

export function LoginPage({ authenticated }: { authenticated: boolean; appUser?: AppUser | null }) {
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginWelcome] = useState(
    () => LOGIN_WELCOMES[Math.floor(Math.random() * LOGIN_WELCOMES.length)]
  );

  if (authenticated) {
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    return <Navigate to={postLoginPath({ pendingCoachCode: getPendingCoachInvite(), returnTo })} replace />;
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setSuccess('');
    setShowPassword(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, `${firstName} ${lastName}`.trim());
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${mode === 'signup' ? 'Sign up' : 'Login'} failed`);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim()) {
      setError('Enter the email address for your account.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSuccess(`If an account exists for ${email.trim()}, a password reset link is on its way.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setSubmitting(false);
    }
  }

  async function googleLogin() {
    setError('');
    setSuccess('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  }

  async function appleLogin() {
    setError('');
    setSuccess('');
    try {
      await loginWithApple();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed');
    }
  }

  const heading =
    mode === 'signup'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : loginWelcome.heading;

  const subtitle =
    mode === 'signup'
      ? 'Join MetabolicOS to start your wellness journey.'
      : mode === 'reset'
        ? 'Enter your email and we\u2019ll send you a link to choose a new password.'
        : loginWelcome.subtitle;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <div className="mb-8">
          <BrandLogo showTagline markSize={44} />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">
            {heading}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-app-text-muted">{subtitle}</p>
        </div>

        {!isFirebaseConfigured && (
          <div className="mb-6 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-4 text-sm text-brand-navy dark:text-brand-off-white">
            <p className="font-semibold">Firebase is not configured yet.</p>
            <p className="mt-1">
              Add your Firebase web app values to <code>client/.env</code>, then restart{' '}
              <code>npm run dev</code>.
            </p>
          </div>
        )}

        {mode === 'reset' ? (
          <form className="space-y-5" onSubmit={submitReset}>
            <div>
              <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-app-text">
                Email address
              </label>
              <input
                id="reset-email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={!isFirebaseConfigured || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
              {!submitting && <ArrowRight size={16} aria-hidden />}
            </button>
            <p className="text-center text-sm text-app-text-muted">
              Remember your password?{' '}
              <button
                type="button"
                className="font-medium text-brand-green hover:underline dark:text-brand-green-light"
                onClick={() => switchMode('login')}
              >
                Sign in
              </button>
            </p>
            {success && <p className="text-sm text-brand-green dark:text-brand-green-light">{success}</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-3">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-black px-4 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-black/90 disabled:opacity-50"
                disabled={!isFirebaseConfigured}
                onClick={appleLogin}
              >
                <AppleIcon />
                Sign in with Apple
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-sm font-medium text-app-text shadow-sm transition hover:bg-app-muted disabled:opacity-50"
                disabled={!isFirebaseConfigured}
                onClick={googleLogin}
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-app-border" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-app-text-muted">
                Or continue with email
              </span>
              <div className="h-px flex-1 bg-app-border" />
            </div>

            <form className="space-y-5" onSubmit={submit}>
              {mode === 'signup' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="first-name" className="mb-2 block text-sm font-medium text-app-text">
                      First name
                    </label>
                    <input
                      id="first-name"
                      className={inputClass}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label htmlFor="last-name" className="mb-2 block text-sm font-medium text-app-text">
                      Last name
                    </label>
                    <input
                      id="last-name"
                      className={inputClass}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-app-text">
                  Email address
                </label>
                <input
                  id="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-app-text">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-green hover:underline dark:text-brand-green-light"
                      onClick={() => switchMode('reset')}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    className={`${inputClass} pr-12`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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

              <button
                type="submit"
                disabled={!isFirebaseConfigured || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-navy px-6 py-3.5 text-sm font-semibold text-brand-off-white shadow-md transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
              >
                {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
                {!submitting && <ArrowRight size={16} aria-hidden />}
              </button>

              {error && <p className="text-sm text-red-500">{error}</p>}

              {mode === 'signup' ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-full border-2 border-brand-green px-6 py-3.5 text-sm font-semibold text-brand-green transition hover:bg-brand-green/10 dark:border-brand-green-light dark:text-brand-green-light dark:hover:bg-brand-green-light/10"
                  onClick={() => switchMode('login')}
                >
                  Sign in
                </button>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center justify-center rounded-full border-2 border-brand-green px-6 py-3.5 text-sm font-semibold text-brand-green transition hover:bg-brand-green/10 dark:border-brand-green-light dark:text-brand-green-light dark:hover:bg-brand-green-light/10"
                  onClick={() => switchMode('signup')}
                >
                  Create an account
                </button>
              )}
            </form>
          </>
        )}
      </div>

      <p className="mt-8 max-w-md text-center text-sm text-app-text-muted">
        Secure access to your personalized wellness dashboard
      </p>
    </main>
  );
}
