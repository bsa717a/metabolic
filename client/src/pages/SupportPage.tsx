import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { Button } from '../components/ui/Button';
import { PRIVACY_POLICY_URL, SUPPORT_CATEGORIES, SUPPORT_EMAIL } from '../config/support';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldClass =
  'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/50 focus-visible:ring-2';

type Status = 'idle' | 'success' | 'error';

export function SupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [errors, setErrors] = useState<{ email?: string; category?: string; message?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [statusText, setStatusText] = useState('');

  function validate(): string | null {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!category) next.category = 'Choose a category.';
    if (!message.trim()) next.message = 'Please enter a message.';
    setErrors(next);
    if (next.email) return 'support-email';
    if (next.category) return 'support-category';
    if (next.message) return 'support-message';
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return; // guard against repeated clicks
    setStatus('idle');
    const firstInvalid = validate();
    if (firstInvalid) {
      setStatus('error');
      setStatusText('Please fix the errors below before submitting.');
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<{ ok: true; reference: string }>('/api/support', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), category, message: message.trim(), website })
      });
      setStatus('success');
      setStatusText(
        `Thanks! Your message was sent (reference ${result.reference}). We’ll get back to you by email as soon as we can.`
      );
      setName('');
      setEmail('');
      setCategory('');
      setMessage('');
      setErrors({});
    } catch (err) {
      setStatus('error');
      setStatusText(err instanceof Error ? err.message : 'Something went wrong. Please try again or email us directly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg text-app-text">
      <header className="border-b border-app-border bg-app-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/login" className="flex items-center gap-3">
            <img src="/logo.png" alt="Master Metabolic" className="h-9 w-auto object-contain [image-rendering:pixelated]" />
            <span className="text-sm font-semibold">Master Metabolic</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight">Metabolic Support</h1>
        <p className="mt-3 text-sm leading-6 text-app-text-muted">
          Need help with the Metabolic app? Send us a message and we’ll get back to you as soon as possible. You can
          also email us at{' '}
          <a className="font-medium text-app-text underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <form id="support-form" className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="support-name" className="mb-1 block text-sm font-medium">
              Name <span className="font-normal text-app-text-muted">(optional)</span>
            </label>
            <input
              id="support-name"
              className={fieldClass}
              type="text"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="support-email" className="mb-1 block text-sm font-medium">
              Email address
            </label>
            <input
              id="support-email"
              className={fieldClass}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'support-email-error' : undefined}
            />
            {errors.email && (
              <p id="support-email-error" className="mt-1 text-sm text-red-600">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="support-category" className="mb-1 block text-sm font-medium">
              Issue category
            </label>
            <select
              id="support-category"
              className={fieldClass}
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? 'support-category-error' : undefined}
            >
              <option value="" disabled>
                Choose a category…
              </option>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && (
              <p id="support-category-error" className="mt-1 text-sm text-red-600">
                {errors.category}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="support-message" className="mb-1 block text-sm font-medium">
              Message
            </label>
            <textarea
              id="support-message"
              className={`${fieldClass} min-h-[8rem] resize-y`}
              required
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={errors.message ? 'support-message-error' : 'support-message-hint'}
            />
            <p id="support-message-hint" className="mt-1 text-xs text-app-text-muted">
              Please do not include passwords, payment card information, detailed medical records, or other sensitive
              information.
            </p>
            {errors.message && (
              <p id="support-message-error" className="mt-1 text-sm text-red-600">
                {errors.message}
              </p>
            )}
          </div>

          {/* Honeypot: hidden from users; bots that fill it are silently discarded. */}
          <div className="absolute left-[-9999px]" aria-hidden="true">
            <label htmlFor="support-website">Leave this field empty</label>
            <input
              id="support-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? 'Sending…' : 'Submit'}
          </Button>

          {/* Accessible status: polite for success, assertive for errors. */}
          <p role="status" aria-live="polite" className={`text-sm ${status === 'success' ? 'text-brand-green' : 'sr-only'}`}>
            {status === 'success' ? statusText : ''}
          </p>
          <p role="alert" aria-live="assertive" className={`text-sm ${status === 'error' ? 'text-red-600' : 'sr-only'}`}>
            {status === 'error' ? statusText : ''}
          </p>
        </form>

        <section className="mt-10 space-y-4 border-t border-app-border pt-6 text-sm text-app-text-muted">
          <div>
            <h2 className="text-sm font-semibold text-app-text">Account deletion</h2>
            <p className="mt-1">
              To request deletion of your Metabolic account and associated data, submit this form and choose{' '}
              <span className="font-medium text-app-text">“Privacy or account deletion.”</span> Our team will process
              your request and confirm by email.
            </p>
          </div>

          {PRIVACY_POLICY_URL ? (
            <p>
              {PRIVACY_POLICY_URL.startsWith('http') ? (
                <a
                  className="font-medium text-app-text underline-offset-2 hover:underline"
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
              ) : (
                <Link className="font-medium text-app-text underline-offset-2 hover:underline" to={PRIVACY_POLICY_URL}>
                  Privacy Policy
                </Link>
              )}
            </p>
          ) : null}

          <p className="rounded-xl bg-app-muted/60 p-4">
            Metabolic provides general wellness and nutrition support and is not intended for medical emergencies. For
            urgent medical concerns, contact a qualified healthcare provider or emergency services.
          </p>
        </section>
      </div>
    </main>
  );
}
