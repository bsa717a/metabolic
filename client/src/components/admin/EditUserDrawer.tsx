import { useEffect, useState } from 'react';
import type { AdminUser, CoachSummary, PlanSlug, Role, SubscriptionStatusSlug, UserAccountDetails, UserStatus } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import { UserProfileFields } from '../user/UserProfileFields';
import { buildProfilePayload, emptyProfileDraft, profileToDraft, type ProfileDraft } from '../user/userProfileForm';
import { timezoneOptions } from '../../utils/timezoneOptions';
import { planLabel } from '../../utils/entitlements';

const roles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'COACH', 'USER', 'VIEWER'];
const statuses: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED'];
const plans: PlanSlug[] = ['starter', 'self_guided', 'plus', 'coach_led'];
const subscriptionStatuses: SubscriptionStatusSlug[] = [
  'free',
  'active',
  'trialing',
  'past_due',
  'canceled',
  'coach_managed'
];

type UserDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  plan: PlanSlug;
  subscriptionStatus: SubscriptionStatusSlug;
};

function toDraft(user: AdminUser): UserDraft {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role,
    status: user.status,
    plan: user.plan ?? 'starter',
    subscriptionStatus: user.subscriptionStatus ?? 'free'
  };
}

function formatRole(role: string) {
  return role.replaceAll('_', ' ');
}

function toServerPlan(plan: PlanSlug) {
  const map: Record<PlanSlug, string> = {
    starter: 'STARTER',
    self_guided: 'SELF_GUIDED',
    plus: 'PLUS',
    coach_led: 'COACH_LED'
  };
  return map[plan];
}

function toServerSubscriptionStatus(status: SubscriptionStatusSlug) {
  return status.toUpperCase() as
    | 'FREE'
    | 'ACTIVE'
    | 'TRIALING'
    | 'PAST_DUE'
    | 'CANCELED'
    | 'COACH_MANAGED';
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
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
  coaches?: CoachSummary[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}) {
  if (!user) {
    return null;
  }

  return (
    <EditUserDrawerContent
      key={user.id}
      open={open}
      user={user}
      coaches={coaches ?? []}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function EditUserDrawerContent({
  open,
  user,
  coaches,
  onClose,
  onSaved
}: {
  open: boolean;
  user: AdminUser;
  coaches: CoachSummary[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(user));
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [timezone, setTimezone] = useState('');
  const [smsMealRemindersEnabled, setSmsMealRemindersEnabled] = useState(true);
  const [smsEveningRecapEnabled, setSmsEveningRecapEnabled] = useState(true);
  const [canEditClientNotes, setCanEditClientNotes] = useState(true);
  const [coachLedCoachId, setCoachLedCoachId] = useState(user.assignedCoach?.id ?? '');
  const [endNextPlan, setEndNextPlan] = useState<PlanSlug>('plus');
  const [endGraceDays, setEndGraceDays] = useState(7);
  const [coachActionLoading, setCoachActionLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingWelcomeEmail, setSendingWelcomeEmail] = useState(false);
  const [welcomeEmailStatus, setWelcomeEmailStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    queueMicrotask(() => {
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
    });
  }, [user.id]);

  function updateDraft<K extends keyof UserDraft>(field: K, value: UserDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateProfile<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  }

  async function sendWelcomeEmail() {
    setSendingWelcomeEmail(true);
    setWelcomeEmailStatus('');
    setError('');
    try {
      const result = await api<{ sent: boolean; to: string }>(`/api/admin/users/${user.id}/send-welcome-email`, {
        method: 'POST'
      });
      setWelcomeEmailStatus(`Welcome email sent to ${result.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send welcome email');
    } finally {
      setSendingWelcomeEmail(false);
    }
  }

  async function endCoachLed() {
    setCoachActionLoading(true);
    setError('');
    try {
      const nextUser = await api<AdminUser>(`/api/admin/users/${user.id}/coach-led`, {
        method: 'DELETE',
        body: JSON.stringify({ nextPlan: toServerPlan(endNextPlan), graceDays: endGraceDays })
      });
      onSaved(nextUser);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to end coach-led');
    } finally {
      setCoachActionLoading(false);
    }
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
        status: draft.status,
        plan: toServerPlan(draft.plan),
        subscriptionStatus: toServerSubscriptionStatus(draft.subscriptionStatus)
      };
      if (!payload.firstName || !payload.lastName || !payload.email) {
        throw new Error('First name, last name, and email are required.');
      }
      const updated = await api<AdminUser>(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      let nextUser = updated;
      const previousCoachId = user.assignedCoach?.id ?? '';
      const previousPlan = user.plan ?? 'starter';
      const planChangedOffCoachLed = previousPlan === 'coach_led' && draft.plan !== 'coach_led';

      if (planChangedOffCoachLed && previousCoachId) {
        nextUser = await api<AdminUser>(`/api/admin/users/${user.id}/coach-assignment`, { method: 'DELETE' });
      } else if (coachLedCoachId !== previousCoachId || (draft.plan === 'coach_led' && coachLedCoachId)) {
        if (draft.plan === 'coach_led' && coachLedCoachId) {
          nextUser = await api<AdminUser>(`/api/admin/users/${user.id}/coach-led`, {
            method: 'POST',
            body: JSON.stringify({ coachId: coachLedCoachId })
          });
        } else if (coachLedCoachId) {
          nextUser = await api<AdminUser>(`/api/admin/users/${user.id}/coach-assignment`, {
            method: 'PUT',
            body: JSON.stringify({ coachId: coachLedCoachId })
          });
        } else if (previousCoachId) {
          nextUser = await api<AdminUser>(`/api/admin/users/${user.id}/coach-assignment`, { method: 'DELETE' });
        }
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
    <Drawer
      open={open}
      title={`${user.firstName} ${user.lastName}`}
      onClose={onClose}
      showClose={false}
      panelClassName="max-w-md"
      headerActions={
        <>
          <Button disabled={saving || loadingProfile} onClick={save}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
    <div className="space-y-6">
      <p className="text-sm text-app-text-muted">Update account details for {user.email}.</p>

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
          <span className={labelClassName()}>Plan</span>
          <select className={inputClassName()} value={draft.plan} onChange={(event) => updateDraft('plan', event.target.value as PlanSlug)}>
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {planLabel(plan)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName()}>Subscription status</span>
          <select
            className={inputClassName()}
            value={draft.subscriptionStatus}
            onChange={(event) => updateDraft('subscriptionStatus', event.target.value as SubscriptionStatusSlug)}
          >
            {subscriptionStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName()}>Primary coach</span>
          <select className={inputClassName()} value={coachLedCoachId} onChange={(event) => setCoachLedCoachId(event.target.value)}>
            <option value="">No coach assigned</option>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.firstName} {coach.lastName} ({coach.email})
                {coach.activeCoachLedLicenses != null ? ` — ${coach.activeCoachLedLicenses} active licenses` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-app-text-muted">
            Set plan to Coach-Led and pick a coach, then save to assign coach-led access.
          </p>
        </label>

        {user.plan === 'coach_led' ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">End coach-led relationship</p>
            <label className="block">
              <span className={labelClassName()}>Next plan after grace</span>
              <select className={inputClassName()} value={endNextPlan} onChange={(event) => setEndNextPlan(event.target.value as PlanSlug)}>
                <option value="plus">Metabolic Plus</option>
                <option value="self_guided">Self-Guided</option>
                <option value="starter">Starter</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClassName()}>Grace period (days)</span>
              <NumberInput
                className={inputClassName()}
                min={0}
                max={30}
                value={endGraceDays}
                onChange={setEndGraceDays}
              />
            </label>
            <Button variant="secondary" disabled={coachActionLoading || saving} onClick={() => void endCoachLed()}>
              End coach-led (removes coach access immediately)
            </Button>
          </div>
        ) : null}

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
          <span className="mt-1 block text-xs text-app-text-muted">
            Used to time reminder texts. Reminders are skipped until this is set.
          </span>
        </label>

        <div className="space-y-3 rounded-xl border border-app-border bg-app-muted p-4">
          <p className="text-sm font-semibold text-app-text">Text reminders</p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-app-border text-blue-500 focus:ring-blue-200"
              checked={smsMealRemindersEnabled}
              disabled={loadingProfile || !profileLoaded}
              onChange={(event) => setSmsMealRemindersEnabled(event.target.checked)}
            />
            <span className="text-sm text-app-text-muted">
              Text before planned meals (up to 30 minutes ahead, once per meal).
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-app-border text-blue-500 focus:ring-blue-200"
              checked={smsEveningRecapEnabled}
              disabled={loadingProfile || !profileLoaded}
              onChange={(event) => setSmsEveningRecapEnabled(event.target.checked)}
            />
            <span className="text-sm text-app-text-muted">
              Short evening check-in around 8:00 PM.
            </span>
          </label>
        </div>
      </div>

      {loadingProfile ? (
        <p className="text-sm text-app-text-muted">Loading health profile…</p>
      ) : profileLoadError ? (
        <p className="text-sm text-amber-700">
          {profileLoadError} Account fields can still be saved, but health profile changes are unavailable until it loads.
        </p>
      ) : (
        <UserProfileFields draft={profileDraft} canEditClientNotes={canEditClientNotes} onChange={updateProfile} />
      )}

      <div className="space-y-2 rounded-xl border border-app-border bg-app-muted p-4">
        <p className="text-sm font-semibold text-app-text">Email</p>
        <p className="text-sm text-app-text-muted">
          Send the Metabolic OS welcome email to this user&apos;s saved account address ({user.email}).
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={sendingWelcomeEmail || !user.email}
          onClick={() => void sendWelcomeEmail()}
        >
          {sendingWelcomeEmail ? 'Sending…' : 'Send welcome email'}
        </Button>
        {welcomeEmailStatus ? <p className="text-sm text-emerald-700">{welcomeEmailStatus}</p> : null}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
    </Drawer>
  );
}
