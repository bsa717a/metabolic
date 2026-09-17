import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  AI_CONSENT_DATA_SENT,
  AI_CONSENT_INTRO,
  AI_CONSENT_PURPOSE,
  AI_CONSENT_RECIPIENT,
  AI_CONSENT_TITLE
} from '../../content/aiConsentCopy';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export function AiConsentModal({
  open,
  saving,
  error,
  dismissible,
  onAccept,
  onDecline,
  onClose
}: {
  open: boolean;
  saving: boolean;
  error?: string;
  dismissible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      onClick={dismissible ? onClose : undefined}
    >
      <Card className="w-full max-w-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green">
            <Sparkles size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="ai-consent-title" className="text-lg font-bold text-app-text">
              {AI_CONSENT_TITLE}
            </h2>
            <p className="mt-1 text-sm text-app-text-muted">{AI_CONSENT_INTRO}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm text-app-text">
          <div>
            <dt className="font-semibold">Recipient</dt>
            <dd className="mt-0.5 text-app-text-muted">{AI_CONSENT_RECIPIENT}</dd>
          </div>
          <div>
            <dt className="font-semibold">What may be sent</dt>
            <dd className="mt-0.5">
              <ul className="list-disc space-y-1 pl-5 text-app-text-muted">
                {AI_CONSENT_DATA_SENT.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Purpose</dt>
            <dd className="mt-0.5 text-app-text-muted">{AI_CONSENT_PURPOSE}</dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-app-text-muted">
          You must tap Accept before any of this data is sent to Gemini. You can turn AI off later in Account
          details. See our{' '}
          <Link to="/privacy" className="font-medium text-brand-green underline" onClick={onClose}>
            Privacy Policy
          </Link>
          .
        </p>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={saving} onClick={onDecline}>
            {saving ? 'Saving…' : 'Decline AI'}
          </Button>
          <Button type="button" disabled={saving} onClick={onAccept}>
            {saving ? 'Saving…' : 'Accept'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
