import { useState } from 'react';
import type { AdminUser, Role, UserStatus, UserSummary } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

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

function formatHeight(profile: NonNullable<AdminUser['profile']>) {
  if (profile.heightInches != null) {
    const feet = Math.floor(profile.heightInches / 12);
    const inches = profile.heightInches % 12;
    return `${feet}'${inches}"`;
  }
  return profile.heightRaw ?? null;
}

function formatAddress(profile: NonNullable<AdminUser['profile']>) {
  const street = [profile.addressLine1, profile.addressLine2].filter(Boolean).join(', ');
  const cityState = [profile.city, profile.state].filter(Boolean).join(', ');
  const full = [street, cityState, profile.zip].filter(Boolean).join(' • ');
  return full || null;
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="whitespace-pre-wrap text-sm text-slate-700">{value}</span>
    </div>
  );
}

function ClientProfileSection({ profile }: { profile?: AdminUser['profile'] }) {
  if (!profile) return null;

  const emergencyContact = [profile.emergencyContactName, profile.emergencyContactRelationship]
    .filter(Boolean)
    .join(' • ');
  const emergencyContactLine = [emergencyContact, profile.emergencyContactPhone].filter(Boolean).join(' — ');

  const rows = [
    { label: 'Address', value: formatAddress(profile) },
    { label: 'Emergency contact', value: emergencyContactLine || null },
    { label: 'Height', value: formatHeight(profile) },
    { label: 'Medical conditions', value: profile.medicalConditions },
    { label: 'Exercise conditions', value: profile.exerciseConditions },
    { label: 'Food conditions', value: profile.foodConditions },
    { label: 'Diet notes', value: profile.dietNotes },
    { label: 'Coach notes', value: profile.coachNotes }
  ];

  if (rows.every((row) => !row.value)) return null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-700">Client profile</h3>
      <p className="text-xs text-slate-500">Imported from the legacy system. Read-only.</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <ProfileRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
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
  const [coachId, setCoachId] = useState(user.assignedCoach?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft<K extends keyof UserDraft>(field: K, value: UserDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
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
      onSaved(nextUser);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Update account details for {user.email}.</p>

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

      <ClientProfileSection profile={user.profile} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
