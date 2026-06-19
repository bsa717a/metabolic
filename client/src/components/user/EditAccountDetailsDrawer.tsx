import { useEffect, useState } from 'react';
import type { UserAccountDetails } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { UserProfileFields } from './UserProfileFields';
import { buildProfilePayload, emptyProfileDraft, profileToDraft, type ProfileDraft } from './userProfileForm';

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600 dark:text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-app-border dark:bg-app-surface dark:text-app-text';
}

type AccountDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  timezone: string;
  smsRemindersEnabled: boolean;
};

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
];

function timezoneOptions(current: string) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return Array.from(new Set([current, detected, ...COMMON_TIMEZONES].filter(Boolean)));
}

export function EditAccountDetailsDrawer({
  open,
  userId,
  title,
  mode,
  onClose,
  onSaved
}: {
  open: boolean;
  userId: string;
  title: string;
  mode: 'self' | 'coach';
  onClose: () => void;
  onSaved?: (details: UserAccountDetails) => void;
}) {
  return (
    <Drawer open={open} title={title} onClose={onClose}>
      {open && (
        <EditAccountDetailsDrawerContent
          key={userId}
          userId={userId}
          mode={mode}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditAccountDetailsDrawerContent({
  userId,
  mode,
  onClose,
  onSaved
}: {
  userId: string;
  mode: 'self' | 'coach';
  onClose: () => void;
  onSaved?: (details: UserAccountDetails) => void;
}) {
  const [accountDraft, setAccountDraft] = useState<AccountDraft>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    timezone: '',
    smsRemindersEnabled: true
  });
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [canEditClientNotes, setCanEditClientNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoaded(false);
    setError('');
    api<UserAccountDetails>(`/api/users/${userId}/profile`)
      .then((details) => {
        setAccountDraft({
          firstName: details.firstName,
          lastName: details.lastName,
          email: details.email,
          phone: details.phone ?? '',
          timezone: details.timezone ?? '',
          smsRemindersEnabled: details.smsRemindersEnabled ?? true
        });
        setProfileDraft(profileToDraft(details));
        setCanEditClientNotes(details.canEditClientNotes);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load account details');
      })
      .finally(() => setLoading(false));
  }, [userId]);

  function updateAccount<K extends keyof AccountDraft>(field: K, value: AccountDraft[K]) {
    setAccountDraft((current) => ({ ...current, [field]: value }));
  }

  function updateProfile<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string | number | boolean | null> = {
        ...buildProfilePayload(profileDraft, canEditClientNotes),
        phone: accountDraft.phone.trim() ? accountDraft.phone.trim() : null,
        timezone: accountDraft.timezone.trim() ? accountDraft.timezone.trim() : null,
        smsRemindersEnabled: accountDraft.smsRemindersEnabled
      };

      if (mode === 'self') {
        const firstName = accountDraft.firstName.trim();
        const lastName = accountDraft.lastName.trim();
        if (!firstName || !lastName) {
          throw new Error('First name and last name are required.');
        }
        payload.firstName = firstName;
        payload.lastName = lastName;
      }

      const saved = await api<UserAccountDetails>(`/api/users/${userId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account details');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading account details…</p>;
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error || 'Unable to load account details.'}</p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const readOnlyAccount = mode === 'coach';

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-app-text">Account</p>
          <p className="mt-1 text-sm text-app-text-muted">
            {readOnlyAccount
              ? 'Contact details for this client. Email is managed by admins.'
              : 'Your contact details and health profile.'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClassName()}>First name</span>
            <input
              className={inputClassName()}
              value={accountDraft.firstName}
              readOnly={readOnlyAccount}
              onChange={(event) => updateAccount('firstName', event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClassName()}>Last name</span>
            <input
              className={inputClassName()}
              value={accountDraft.lastName}
              readOnly={readOnlyAccount}
              onChange={(event) => updateAccount('lastName', event.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <span className={labelClassName()}>Email</span>
          <input className={inputClassName()} type="email" value={accountDraft.email} readOnly />
        </label>

        <label className="block">
          <span className={labelClassName()}>Phone</span>
          <input
            className={inputClassName()}
            value={accountDraft.phone}
            onChange={(event) => updateAccount('phone', event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label className="block">
          <span className={labelClassName()}>Timezone</span>
          <select
            className={inputClassName()}
            value={accountDraft.timezone}
            onChange={(event) => updateAccount('timezone', event.target.value)}
          >
            <option value="">Not set</option>
            {timezoneOptions(accountDraft.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-app-text-muted">
            Used to time meal reminder texts. Reminders are skipped until this is set.
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200 dark:border-app-border"
            checked={accountDraft.smsRemindersEnabled}
            onChange={(event) => updateAccount('smsRemindersEnabled', event.target.checked)}
          />
          <span className="text-sm text-slate-600 dark:text-app-text-muted">
            Text me reminders before meals and a short evening check-in.
          </span>
        </label>
      </div>

      <UserProfileFields draft={profileDraft} canEditClientNotes={canEditClientNotes} onChange={updateProfile} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save account details'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
