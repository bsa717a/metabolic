import { useEffect, useState } from 'react';
import type { AdminUser, Role, UserAccountDetails, UserStatus, UserSummary } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { UserProfileFields } from '../user/UserProfileFields';
import { buildProfilePayload, emptyProfileDraft, profileToDraft, type ProfileDraft } from '../user/userProfileForm';
import { timezoneOptions } from '../../utils/timezoneOptions';

const roles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'COACH', 'USER', 'VIEWER'];
const statuses: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED'];

type UserDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
};

function toDraft(user: AdminUser): UserDraft {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role,
    status: user.status
  };
}

function formatRole(role: string) {
  return role.replaceAll('_', ' ');
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

export function EditUserDrawer({
  open,
  user,
  onClose,
  onSaved,
  coaches
}: {
  open: boolean;
  user?: AdminUser;
  coaches?: UserSummary[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}) {
  return (
    <Drawer open={open} title={user ? `${user.firstName} ${user.lastName}` : 'Edit user'} onClose={onClose}>
      {open && user && <EditUserDrawerContent key={user.id} user={user} coaches={coaches ?? []} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  );
}

function EditUserDrawerContent({
  user,
  coaches,
  onClose,
  onSaved
}: {
  user: AdminUser;
  coaches: UserSummary[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(user));
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [timezone, setTimezone] = useState('');
  const [smsMealRemindersEnabled, setSmsMealRemindersEnabled] = useState(true);
  const [smsEveningRecapEnabled, setSmsEveningRecapEnabled] = useState(true);
  const [canEditClientNotes, setCanEditClientNotes] = useState(true);
  const [coachId, setCoachId] = useState(user.assignedCoach?.id ?? '');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingProfile(true);
    setProfileLoadError('');
    setProfileLoaded(false);
    api<UserAccountDetails>(`/api/users/${user.id}/profile`)
      .then((details) => {
        setProfileDraft(profileToDraft(details));
        setTimezone(details.timezone ?? '');
        setSmsMealRemindersEnabled(details.smsMealRemindersEnabled ?? details.smsRemindersEnabled ?? true);
        setSmsEveningRecapEnabled(details.smsEveningRecapEnabled ?? details.smsRemindersEnabled ?? true);
        setCanEditClientNotes(details.canEditClientNotes);
        setProfileLoaded(true);
      })
      .catch((err) => {
        setProfileLoadError(err instanceof Error ? err.message : 'Unable to load health profile');
      })
      .finally(() => setLoadingProfile(false));
  }, [user.id]);

  function updateDraft<K extends keyof UserDraft>(field: K, value: UserDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateProfile<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() ? draft.phone.trim() : null,
        role: draft.role,
        status: draft.status
      };
      if (!payload.firstName || !payload.lastName || !payload.email) {
        throw new Error('First name, last name, and email are required.');
      }
      const updated = await api<AdminUser>(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      let nextUser = updated;
      if (coachId !== (user.assignedCoach?.id ?? '')) {
        nextUser = coachId
          ? await api<AdminUser>(`/api/admin/users/${user.id}/coach-assignment`, {
              method: 'PUT',
              body: JSON.stringify({ coachId })
            })
          : await api<AdminUser>(`/api/admin/users/${user.id}/coach-assignment`, { method: 'DELETE' });
      }
      if (profileLoaded) {
        await api<UserAccountDetails>(`/api/users/${user.id}/profile`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...buildProfilePayload(profileDraft, canEditClientNotes),
            timezone: timezone.trim() ? timezone.trim() : null,
            smsMealRemindersEnabled,
            smsEveningRecapEnabled
          })
        });
      }
      onSaved(nextUser);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Update account details for {user.email}.</p>

      <div className="space-y-4">
        <label className="block">
          <span className={labelClassName()}>First name</span>
          <input className={inputClassName()} value={draft.firstName} onChange={(event) => updateDraft('firstName', event.target.value)} />
        </label>

        <label className="block">
          <span className={labelClassName()}>Last name</span>
          <input className={inputClassName()} value={draft.lastName} onChange={(event) => updateDraft('lastName', event.target.value)} />
        </label>

        <label className="block">
          <span className={labelClassName()}>Email</span>
          <input className={inputClassName()} type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
        </label>

        <label className="block">
          <span className={labelClassName()}>Phone</span>
          <input className={inputClassName()} value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} placeholder="Optional" />
        </label>

        <label className="block">
          <span className={labelClassName()}>Role</span>
          <select className={inputClassName()} value={draft.role} onChange={(event) => updateDraft('role', event.target.value as Role)}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName()}>Status</span>
          <select className={inputClassName()} value={draft.status} onChange={(event) => updateDraft('status', event.target.value as UserStatus)}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName()}>Primary coach</span>
          <select className={inputClassName()} value={coachId} onChange={(event) => setCoachId(event.target.value)}>
            <option value="">No coach assigned</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.firstName} {coach.lastName} ({coach.email})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Only super admins can save coach assignment changes.</p>
        </label>

        <label className="block">
          <span className={labelClassName()}>Timezone</span>
          <select
            className={inputClassName()}
            value={timezone}
            disabled={loadingProfile || !profileLoaded}
            onChange={(event) => setTimezone(event.target.value)}
          >
            <option value="">Not set</option>
            {timezoneOptions(timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Used to time reminder texts. Reminders are skipped until this is set.
          </span>
        </label>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Text reminders</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200"
              checked={smsMealRemindersEnabled}
              disabled={loadingProfile || !profileLoaded}
              onChange={(event) => setSmsMealRemindersEnabled(event.target.checked)}
            />
            <span className="text-sm text-slate-600">
              Text before planned meals (up to 30 minutes ahead, once per meal).
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200"
              checked={smsEveningRecapEnabled}
              disabled={loadingProfile || !profileLoaded}
              onChange={(event) => setSmsEveningRecapEnabled(event.target.checked)}
            />
            <span className="text-sm text-slate-600">
              Short evening check-in around 8:00 PM.
            </span>
          </label>
        </div>
      </div>

      {loadingProfile ? (
        <p className="text-sm text-slate-500">Loading health profile…</p>
      ) : profileLoadError ? (
        <p className="text-sm text-amber-700">
          {profileLoadError} Account fields can still be saved, but health profile changes are unavailable until it loads.
        </p>
      ) : (
        <UserProfileFields draft={profileDraft} canEditClientNotes={canEditClientNotes} onChange={updateProfile} />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving || loadingProfile} onClick={save}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
