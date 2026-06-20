import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type AdminSettings = {
  coachRequestNotificationEmail: string | null;
};

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40';
}

export function AdminSettingsPanel() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api<AdminSettings>('/api/admin/settings')
      .then((data) => {
        setSettings(data);
        setEmail(data.coachRequestNotificationEmail ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await api<AdminSettings>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          coachRequestNotificationEmail: email.trim() ? email.trim() : null
        })
      });
      setSettings(saved);
      setEmail(saved.coachRequestNotificationEmail ?? '');
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading settings…</p>;
  }

  return (
    <Card className="max-w-2xl">
      <h2 className="text-lg font-bold text-app-text">Settings</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Configure admin notifications and other global app settings.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className={labelClassName()}>Coach request notification email</span>
          <input
            className={inputClassName()}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
          />
          <span className="mt-1 block text-xs text-app-text-muted">
            Sends when a user checks &quot;I&apos;d like to work with a real coach&quot; during setup and no coach is
            matched.
          </span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-brand-green">{message}</p> : null}

        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>

        {settings?.coachRequestNotificationEmail ? (
          <p className="text-xs text-app-text-muted">
            Current notification email: {settings.coachRequestNotificationEmail}
          </p>
        ) : (
          <p className="text-xs text-app-text-muted">No coach request notification email is configured.</p>
        )}
      </div>
    </Card>
  );
}
