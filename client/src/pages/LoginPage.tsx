import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { login, loginWithGoogle, resetPassword, signUp } from '../services/auth';
import { isFirebaseConfigured } from '../services/firebase';
import { BrandLogo } from '../components/brand/BrandLogo';
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

type AuthMode = 'login' | 'signup' | 'reset';

export function LoginPage({ authenticated }: { authenticated: boolean; appUser?: AppUser | null }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('user@metabolic.local');
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

  if (authenticated) return <Navigate to="/" replace />;

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
                placeholder="user@metabolic.local"
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
            <button
              type="button"
              className="mb-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-app-border bg-app-surface px-4 py-3.5 text-sm font-medium text-app-text shadow-sm transition hover:bg-app-muted disabled:opacity-50"
              disabled={!isFirebaseConfigured}
              onClick={googleLogin}
            >
              <GoogleIcon />
              Continue with Google
            </button>

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
                  placeholder="user@metabolic.local"
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

              <p className="text-center text-sm text-app-text-muted">
                {mode === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="font-medium text-brand-green hover:underline dark:text-brand-green-light"
                      onClick={() => switchMode('login')}
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New to MetabolicOS?{' '}
                    <button
                      type="button"
                      className="font-medium text-brand-green hover:underline dark:text-brand-green-light"
                      onClick={() => switchMode('signup')}
                    >
                      Create an account
                    </button>
                  </>
                )}
              </p>
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
