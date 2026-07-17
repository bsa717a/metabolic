import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { AppUser } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/** Flip to true to auto-show the SMS meal reminders intro for new users on login. */
export const AUTO_SHOW_SMS_REMINDERS_INTRO = false;

export function SmsRemindersIntroModal({
  user,
  onComplete
}: {
  user?: AppUser | null;
  onComplete?: (user: AppUser) => void;
}) {
  const open = Boolean(AUTO_SHOW_SMS_REMINDERS_INTRO && user && !user.smsRemindersIntroCompletedAt);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function acknowledge() {
    if (!user || saving) return;
    setSaving(true);
    try {
      const result = await api<{ user: AppUser }>('/api/tutorial/sms-reminders-intro/complete', { method: 'POST' });
      onComplete?.(result.user);
    } catch {
      onComplete?.({ ...user!, smsRemindersIntroCompletedAt: new Date().toISOString() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-reminders-intro-title"
    >
      <Card className="w-full max-w-lg shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green">
            <MessageSquare size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="sms-reminders-intro-title" className="text-lg font-bold text-app-text">
              New: text meal reminders
            </h2>
            <p className="mt-1 text-sm text-app-text-muted">
              v1 — more reminder options coming. New here? A light nudge can help habits stick. Set up in{' '}
              <span className="font-medium text-app-text">Account details</span> (top right → your name):
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-3 text-sm text-app-text">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-muted text-xs font-bold text-app-text-muted">
              1
            </span>
            <span>
              <span className="font-semibold">Phone</span> — your mobile, not the food-logging number.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-muted text-xs font-bold text-app-text-muted">
              2
            </span>
            <span>
              <span className="font-semibold">Timezone</span> — your local day and time.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-muted text-xs font-bold text-app-text-muted">
              3
            </span>
            <span>
              <span className="font-semibold">Text reminders</span> — pre-meal and/or evening check-in.
            </span>
          </li>
        </ol>

        <div className="mt-5 rounded-xl border border-app-border bg-app-muted/50 p-4 text-sm text-app-text-muted">
          <p className="font-semibold text-app-text">When texts send</p>
          <ul className="mt-2 space-y-1.5">
            <li>
              <span className="font-medium text-app-text">Meals:</span> up to 30 min before each timed meal (once per
              meal).
            </li>
            <li>
              <span className="font-medium text-app-text">Evening:</span> ~8 PM local, if enabled.
            </li>
          </ul>
          <p className="mt-3">Turn off anytime in Account details.</p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" disabled={saving} onClick={() => void acknowledge()}>
            {saving ? 'Saving…' : 'I understand'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
