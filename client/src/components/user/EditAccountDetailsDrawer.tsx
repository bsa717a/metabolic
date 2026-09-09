import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppUser, UserAccountDetails } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { UserProfileFields } from './UserProfileFields';
import { timezoneOptions } from '../../utils/timezoneOptions';
import { buildProfilePayload, emptyProfileDraft, profileToDraft, type ProfileDraft } from './userProfileForm';
import { logout } from '../../services/auth';
import { useTutorial } from '../tutorial/TutorialContext';
import { PushNotificationsCard } from './PushNotificationsCard';

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
  smsMealRemindersEnabled: boolean;
  smsEveningRecapEnabled: boolean;
};

export function EditAccountDetailsDrawer({
  open,
  userId,
  title,
  mode,
  user,
  onClose,
  onSaved,
  onUserUpdated
}: {
  open: boolean;
  userId: string;
  title: string;
  mode: 'self' | 'coach';
  user?: AppUser | null;
  onClose: () => void;
  onSaved?: (details: UserAccountDetails) => void;
  onUserUpdated?: (user: AppUser) => void;
}) {
  return (
    <EditAccountDetailsDrawerContent
      open={open}
      userId={userId}
      title={title}
      mode={mode}
      user={user}
      onClose={onClose}
      onSaved={onSaved}
      onUserUpdated={onUserUpdated}
    />
  );
}

function EditAccountDetailsDrawerContent({
  open,
  userId,
  title,
  mode,
  user,
  onClose,
  onSaved,
  onUserUpdated
}: {
  open: boolean;
  userId: string;
  title: string;
  mode: 'self' | 'coach';
  user?: AppUser | null;
  onClose: () => void;
  onSaved?: (details: UserAccountDetails) => void;
  onUserUpdated?: (user: AppUser) => void;
}) {
  const navigate = useNavigate();
  const { startTour } = useTutorial();
  const [accountDraft, setAccountDraft] = useState<AccountDraft>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    timezone: '',
    smsMealRemindersEnabled: true,
    smsEveningRecapEnabled: true
  });
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [canEditClientNotes, setCanEditClientNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coachSaving, setCoachSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [assignedCoach, setAssignedCoach] = useState(user?.assignedCoach ?? null);
  const [coachRequestedAt, setCoachRequestedAt] = useState(user?.coachRequestedAt ?? null);
  const [coachCode, setCoachCode] = useState('');
  const [wantsCoach, setWantsCoach] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoaded(false);
    setError('');
    setDeleteError('');
    setAssignedCoach(user?.assignedCoach ?? null);
    setCoachRequestedAt(user?.coachRequestedAt ?? null);
    setCoachCode('');
    setWantsCoach(Boolean(user?.coachRequestedAt) && !user?.assignedCoach);
    api<UserAccountDetails>(`/api/users/${userId}/profile`)
      .then((details) => {
        setAccountDraft({
          firstName: details.firstName,
          lastName: details.lastName,
          email: details.email,
          phone: details.phone ?? '',
          timezone: details.timezone ?? '',
          smsMealRemindersEnabled: details.smsMealRemindersEnabled ?? details.smsRemindersEnabled ?? true,
          smsEveningRecapEnabled: details.smsEveningRecapEnabled ?? details.smsRemindersEnabled ?? true
        });
        setProfileDraft(profileToDraft(details));
        setCanEditClientNotes(details.canEditClientNotes);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load account details');
      })
      .finally(() => setLoading(false));
  }, [userId, open, user?.assignedCoach?.id, user?.coachRequestedAt]);

  function updateAccount<K extends keyof AccountDraft>(field: K, value: AccountDraft[K]) {
    setAccountDraft((current) => ({ ...current, [field]: value }));
  }

  function updateProfile<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  function applyCoachUser(next: AppUser) {
    setAssignedCoach(next.assignedCoach ?? null);
    setCoachRequestedAt(next.coachRequestedAt ?? null);
    setCoachCode('');
    setWantsCoach(Boolean(next.coachRequestedAt) && !next.assignedCoach);
    onUserUpdated?.(next);
  }

  async function saveCoachSupport() {
    const trimmedCode = coachCode.trim();
    if (!trimmedCode && !wantsCoach) {
      throw new Error('Enter a coach code or request a real coach.');
    }
    const next = await api<{ user: AppUser }>('/api/me/coach-support', {
      method: 'PUT',
      body: JSON.stringify({
        ...(trimmedCode ? { coachCode: trimmedCode } : {}),
        ...(wantsCoach ? { wantsCoach: true } : {})
      })
    });
    applyCoachUser(next.user);
  }

  async function turnOffCoach() {
    setCoachSaving(true);
    setError('');
    try {
      const next = await api<{ user: AppUser }>('/api/me/coach-support', { method: 'DELETE' });
      applyCoachUser(next.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to turn off coach support');
    } finally {
      setCoachSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, string | number | boolean | null> = {
        ...buildProfilePayload(profileDraft, canEditClientNotes),
        phone: accountDraft.phone.trim() ? accountDraft.phone.trim() : null,
        timezone: accountDraft.timezone.trim() ? accountDraft.timezone.trim() : null,
        smsMealRemindersEnabled: accountDraft.smsMealRemindersEnabled,
        smsEveningRecapEnabled: accountDraft.smsEveningRecapEnabled
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
      if (mode === 'self' && !assignedCoach && (coachCode.trim() || wantsCoach)) {
        await saveCoachSupport();
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save account details');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    const typed = window.prompt(
      'This permanently deletes your Metabolic account, logs, meals, and photos. Type DELETE to confirm.'
    );
    if ((typed ?? '').trim().toUpperCase() !== 'DELETE') return;

    setDeleting(true);
    setDeleteError('');
    try {
      await api('/api/me', { method: 'DELETE' });
      onClose();
      await logout();
    } catch (err) {
      setDeleteError(err instanceof Error && err.message ? err.message : 'Unable to delete account');
    } finally {
      setDeleting(false);
    }
  }

  const readOnlyAccount = mode === 'coach';
  const busy = saving || coachSaving || deleting;

  return (
    <Drawer
      open={open}
      title={title}
      onClose={onClose}
      showClose={false}
      panelClassName="max-w-md"
      headerActions={
        loaded ? (
          <>
            <Button disabled={busy} onClick={save}>
              {saving ? 'Saving…' : 'Save account details'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
    {loading ? (
      <p className="text-sm text-app-text-muted">Loading account details…</p>
    ) : !loaded ? (
      <p className="text-sm text-red-600">{error || 'Unable to load account details.'}</p>
    ) : (
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
            Used to time reminders. Reminders are skipped until this is set.
          </span>
        </label>

        {mode === 'self' ? (
          <div className="space-y-3 rounded-xl border border-app-border bg-app-muted/40 p-4">
            <div>
              <p className="text-sm font-semibold text-app-text">Real coach</p>
              <p className="mt-1 text-sm text-app-text-muted">
                Optional. Your virtual coach stays available either way.
              </p>
            </div>

            {assignedCoach ? (
              <>
                <p className="text-sm text-app-text">
                  Assigned to{' '}
                  <span className="font-medium">
                    {`${assignedCoach.firstName} ${assignedCoach.lastName}`.trim() || assignedCoach.email}
                  </span>
                  .
                </p>
                <Button variant="secondary" disabled={busy} onClick={() => void turnOffCoach()}>
                  {coachSaving ? 'Turning off…' : 'Turn off coach'}
                </Button>
              </>
            ) : coachRequestedAt ? (
              <>
                <p className="text-sm text-app-text">Coach requested. We&apos;ll connect you when a coach is available.</p>
                <label className="block">
                  <span className={labelClassName()}>Coach initials or code</span>
                  <input
                    className={`${inputClassName()} uppercase`}
                    value={coachCode}
                    maxLength={20}
                    placeholder="DF"
                    onChange={(event) => setCoachCode(event.target.value.toUpperCase())}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !coachCode.trim()}
                    onClick={() => {
                      void (async () => {
                        setCoachSaving(true);
                        setError('');
                        try {
                          await saveCoachSupport();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Unable to update coach support');
                        } finally {
                          setCoachSaving(false);
                        }
                      })();
                    }}
                  >
                    {coachSaving ? 'Saving…' : 'Save coach code'}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void turnOffCoach()}>
                    {coachSaving ? 'Canceling…' : 'Cancel request'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className={labelClassName()}>Coach initials or code</span>
                  <input
                    className={`${inputClassName()} uppercase`}
                    value={coachCode}
                    maxLength={20}
                    placeholder="DF"
                    onChange={(event) => setCoachCode(event.target.value.toUpperCase())}
                  />
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200 dark:border-app-border"
                    checked={wantsCoach}
                    onChange={(event) => setWantsCoach(event.target.checked)}
                  />
                  <span className="text-sm text-slate-600 dark:text-app-text-muted">
                    I&apos;d like to work with a real coach.
                  </span>
                </label>
              </>
            )}
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-app-border bg-app-muted/40 p-4">
          <p className="text-sm font-semibold text-app-text">Reminders</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200 dark:border-app-border"
              checked={accountDraft.smsMealRemindersEnabled}
              onChange={(event) => updateAccount('smsMealRemindersEnabled', event.target.checked)}
            />
            <span className="text-sm text-slate-600 dark:text-app-text-muted">
              Before planned meals (up to 30 minutes ahead, once per meal). Sent as a text and on devices you
              enable.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200 dark:border-app-border"
              checked={accountDraft.smsEveningRecapEnabled}
              onChange={(event) => updateAccount('smsEveningRecapEnabled', event.target.checked)}
            />
            <span className="text-sm text-slate-600 dark:text-app-text-muted">
              Evening check-in around 8:00 PM. Sent as a text and on devices you enable.
            </span>
          </label>
        </div>

        {mode === 'self' && <PushNotificationsCard />}
      </div>

      <UserProfileFields draft={profileDraft} canEditClientNotes={canEditClientNotes} onChange={updateProfile} />

      {error && loaded && <p className="text-sm text-red-600">{error}</p>}

      {mode === 'self' && (
        <div className="rounded-xl border border-dashed border-app-border bg-app-muted/40 px-4 py-3">
          <p className="text-sm font-medium text-brand-navy dark:text-brand-off-white">Dashboard tour</p>
          <p className="mt-1 text-sm text-app-text-muted">
            Replay the guided walkthrough of your dashboard, streaks, and badges.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-brand-green transition hover:text-brand-green-light"
            onClick={() => {
              onClose();
              if (window.location.pathname !== '/') {
                navigate('/');
              }
              window.setTimeout(() => startTour({ replay: true }), 300);
            }}
          >
            Replay dashboard tour
          </button>
        </div>
      )}

      {mode === 'self' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">Delete account</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            Permanently removes your account, logs, meals, photos, and sign-in. This cannot be undone.
          </p>
          {deleteError ? <p className="mt-2 text-sm font-medium text-red-800 dark:text-red-200">{deleteError}</p> : null}
          <Button
            type="button"
            variant="secondary"
            className="mt-3 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/60"
            disabled={busy}
            onClick={() => void deleteAccount()}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      )}

    </div>
    )}
    </Drawer>
  );
}
