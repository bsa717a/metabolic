import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, HelpCircle, Lightbulb, MessageSquarePlus, X } from 'lucide-react';
import { api } from '../../services/api';
import { collectDiagnostics, type SelectedRecord } from '../../services/diagnostics';
import { feedbackFabBottom } from '../../utils/floatingActionLayout';
import { useEntitlements } from '../../context/EntitlementsContext';
import { FEATURE_MATRIX, type FeatureKey } from '../../utils/entitlements';
import { Button } from '../ui/Button';

type FeedbackType = 'BUG' | 'CONFUSING' | 'IDEA';

const TYPE_OPTIONS: Array<{ value: FeedbackType; label: string; icon: typeof AlertTriangle; hint: string }> = [
  { value: 'BUG', label: 'Something is broken', icon: AlertTriangle, hint: 'A bug or error' },
  { value: 'CONFUSING', label: 'Something is confusing', icon: HelpCircle, hint: 'Unclear or hard to use' },
  { value: 'IDEA', label: 'I have an idea', icon: Lightbulb, hint: 'A suggestion or request' }
];

const SCREEN_LABELS: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/nutrition/, 'Nutrition'],
  [/^\/exercise/, 'Exercise'],
  [/^\/program/, 'Metabolic Blueprint'],
  [/^\/progress/, 'Progress'],
  [/^\/level-up/, 'Level Up'],
  [/^\/virtual-coach/, 'Virtual Coach'],
  [/^\/coach/, 'Coach'],
  [/^\/store/, 'Store'],
  [/^\/upgrade/, 'Plan & Upgrade'],
  [/^\/admin/, 'Admin']
];

function screenLabelFor(pathname: string) {
  return SCREEN_LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? pathname;
}

/** Minimal, non-health selected-record context derived from the URL. */
function selectedRecordFor(pathname: string, search: string): SelectedRecord | null {
  const params = new URLSearchParams(search);
  for (const key of ['clientId', 'coachId', 'mealId', 'workoutId', 'checkInId', 'date']) {
    const value = params.get(key);
    if (value) return { type: key.replace(/Id$/, ''), id: value };
  }
  const idMatch = pathname.match(/\/(coach|virtual-coach|admin\/[a-z-]+)\/([\w-]+)/);
  if (idMatch) return { type: idMatch[1], id: idMatch[2] };
  return null;
}

const FEATURE_KEYS = Object.keys(FEATURE_MATRIX) as FeatureKey[];

export function FeedbackWidget() {
  const { user, canAccess } = useEntitlements();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [goal, setGoal] = useState('');
  const [detail, setDetail] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  const contextPreview = useMemo(() => {
    const diag = collectDiagnostics({ featureFlags: [] });
    return `${diag.browser} on ${diag.os} · ${diag.deviceType} · ${screenLabelFor(location.pathname)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, open]);

  if (!user || user.feedbackEnabled === false) return null;

  function reset() {
    setType(null);
    setGoal('');
    setDetail('');
    setBlocking(false);
    setError('');
    setReference(null);
    setShowContext(false);
  }

  function close() {
    setOpen(false);
    // Delay reset so the closing state isn't visible mid-animation.
    setTimeout(reset, 200);
  }

  async function submit() {
    if (!type || submitting) return;
    if (!goal.trim() && !detail.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const featureFlags = FEATURE_KEYS.filter((key) => canAccess(key));
      const diagnostics = collectDiagnostics({
        featureFlags,
        selectedRecord: selectedRecordFor(location.pathname, location.search)
      });
      const result = await api<{ reference: string }>('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type,
          goal: goal.trim(),
          detail: detail.trim(),
          blocking,
          route: location.pathname,
          screenLabel: screenLabelFor(location.pathname),
          diagnostics
        })
      });
      setReference(result.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  const fabBottom = feedbackFabBottom();

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Send feedback"
          onClick={() => setOpen(true)}
          style={{ bottom: fabBottom }}
          className="fixed right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-brand-green px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-deep sm:right-6"
        >
          <MessageSquarePlus className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-slate-950/30 p-0 sm:place-items-center sm:p-4" role="presentation" onClick={close}>
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-app-border bg-app-surface p-5 text-app-text shadow-2xl sm:max-w-lg sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{reference ? 'Thank you!' : 'Send feedback'}</h2>
              <button type="button" aria-label="Close" onClick={close} className="rounded-lg p-1 text-app-text-muted hover:bg-app-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {reference ? (
              <div className="space-y-3 py-2 text-center">
                <p className="text-sm text-app-text">Your report was received. Reference:</p>
                <p className="text-2xl font-bold text-brand-green">{reference}</p>
                <p className="text-xs text-app-text-muted">Our team can look it up with this number. Thanks for helping improve Metabolic!</p>
                <Button className="mt-2 w-full" onClick={close}>Done</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2">
                  {TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setType(option.value)}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          active ? 'border-brand-green bg-brand-green/10' : 'border-app-border hover:bg-app-muted'
                        }`}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-brand-green' : 'text-app-text-muted'}`} />
                        <span>
                          <span className="block text-sm font-medium text-app-text">{option.label}</span>
                          <span className="block text-xs text-app-text-muted">{option.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {type && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-app-text">What were you trying to do?</span>
                      <textarea
                        className="w-full resize-y rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40"
                        rows={2}
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        placeholder="e.g. Log dinner for tomorrow"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-app-text">
                        {type === 'IDEA' ? 'What would you like improved?' : 'What happened?'}
                      </span>
                      <textarea
                        className="w-full resize-y rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40"
                        rows={3}
                        value={detail}
                        onChange={(event) => setDetail(event.target.value)}
                        placeholder="A sentence or two is plenty"
                      />
                      <span className="mt-1 block text-xs text-app-text-muted">Please don’t include medical details or personal health notes.</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={blocking}
                        onChange={(event) => setBlocking(event.target.checked)}
                        className="h-4 w-4 rounded border-app-border accent-brand-green"
                      />
                      <span className="text-sm text-app-text">This is preventing me from continuing</span>
                    </label>

                    <div className="rounded-xl border border-app-border">
                      <button
                        type="button"
                        onClick={() => setShowContext((value) => !value)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-app-text-muted"
                      >
                        <span>Context we’ll include (no screenshot)</span>
                        <span>{showContext ? '−' : '+'}</span>
                      </button>
                      {showContext && (
                        <p className="border-t border-app-border px-3 py-2 text-xs text-app-text-muted">
                          {contextPreview}. Plus recent navigation, errors, and failed requests — never passwords, health notes, or personal data.
                        </p>
                      )}
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <Button className="w-full" disabled={submitting} onClick={submit}>
                      {submitting ? 'Sending…' : 'Send feedback'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
