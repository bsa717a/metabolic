import { useCallback, useEffect, useState } from 'react';
import { api, todayKey } from '../../services/api';
import type { AdminUser } from '../../types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

export function CloneDailyLogDialog({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (templateId: string) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(todayKey());
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api<AdminUser[]>('/api/admin/users')
      .then((rows) => {
        setUsers(rows);
        setUserId((current) => current || rows[0]?.id || '');
      })
      .catch(() => setUsers([]));
  }, [open]);

  const submit = useCallback(async () => {
    if (!userId || !name.trim()) {
      setError('User and plan name are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const template = await api<{ id: string }>('/api/admin/nutrition-templates/clone-from-daily-log', {
        method: 'POST',
        body: JSON.stringify({ userId, date, name: name.trim() })
      });
      onCreated(template.id);
      onClose();
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clone daily log');
    } finally {
      setLoading(false);
    }
  }, [userId, date, name, onClose, onCreated]);

  return (
    <Drawer open={open} title="Clone from user day" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-app-text-muted">Create a plan from a user&apos;s planned meals on a specific date.</p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-app-text">User</span>
          <select
            className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName} ({user.email})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-app-text">Date</span>
          <input
            type="date"
            className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-app-text">Plan name</span>
          <input
            className="w-full rounded-xl border border-app-border bg-app-surface text-app-text px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Jordan's Monday plan"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="button" className="w-full" disabled={loading} onClick={() => void submit()}>
          {loading ? 'Creating…' : 'Create plan'}
        </Button>
      </div>
    </Drawer>
  );
}
