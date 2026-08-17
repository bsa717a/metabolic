import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  currentPushPermission,
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getPushCapability,
  isPushOptedOutOnThisDevice,
  type PushCapability
} from '../../services/pushNotifications';

type CardStatus = PushCapability | 'on' | 'denied' | 'loading';

export function PushNotificationsCard() {
  const [status, setStatus] = useState<CardStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const capability = await getPushCapability();
    const permission = currentPushPermission();
    if (permission === 'denied') {
      setStatus('denied');
      return;
    }
    if (capability === 'ready' && permission === 'granted' && !isPushOptedOutOnThisDevice()) {
      setStatus('on');
      return;
    }
    setStatus(capability);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function enable() {
    setBusy(true);
    setError('');
    try {
      await enablePushOnThisDevice();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError('');
    try {
      await disablePushOnThisDevice();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-app-border bg-app-muted/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-green/15 text-brand-green">
          <Bell size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-text">This device</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-app-text-muted">
            Get the same meal and evening reminders as a notification on this phone or computer.
          </p>
        </div>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-app-text-muted">Checking notification support…</p>
      ) : status === 'missing-config' ? (
        <p className="text-sm text-app-text-muted">
          Browser notifications are not configured for this environment yet.
        </p>
      ) : status === 'unsupported' ? (
        <p className="text-sm text-app-text-muted">This browser does not support notifications.</p>
      ) : status === 'needs-pwa' ? (
        <p className="text-sm text-app-text-muted">
          On iPhone, tap Share → Add to Home Screen, open Metabolic from that icon, then enable notifications
          here.
        </p>
      ) : status === 'denied' ? (
        <p className="text-sm text-app-text-muted">
          Notifications are blocked for this site. Allow them in your browser or system settings, then try
          again.
        </p>
      ) : status === 'on' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-app-text">On for this device</p>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void disable()}>
            {busy ? 'Turning off…' : 'Turn off'}
          </Button>
        </div>
      ) : (
        <Button type="button" disabled={busy} onClick={() => void enable()}>
          {busy ? 'Enabling…' : 'Enable notifications'}
        </Button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
