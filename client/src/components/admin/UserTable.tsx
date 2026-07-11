import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { AdminUser, CoachSummary } from '../../types';
import { Card } from '../ui/Card';
import { planLabel } from '../../utils/entitlements';
import { EditUserDrawer } from './EditUserDrawer';

type SortKey = 'name' | 'email' | 'role' | 'coach' | 'joined';
type SortDirection = 'asc' | 'desc';

function formatRole(role: string) {
  return role.replaceAll('_', ' ');
}

function userName(user: AdminUser) {
  return `${user.firstName} ${user.lastName}`.trim();
}

function coachLabel(user: AdminUser) {
  return user.assignedCoach ? `${user.assignedCoach.firstName} ${user.assignedCoach.lastName}`.trim() : '';
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareDates(a: string, b: string, direction: SortDirection) {
  const result = new Date(a).getTime() - new Date(b).getTime();
  return direction === 'asc' ? result : -result;
}

function matchesSearch(user: AdminUser, query: string) {
  const haystack = [
    userName(user),
    user.email,
    formatRole(user.role),
    user.role,
    coachLabel(user),
    user.phone ?? '',
    user.status
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = activeSortKey === sortKey;

  return (
    <th className="py-3 pr-4 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition ${
          active ? 'text-app-text' : 'text-app-text-muted hover:text-app-text'
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function statusClass(status: AdminUser['status']) {
  if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700';
  if (status === 'INVITED') return 'bg-amber-50 text-amber-700';
  return 'bg-app-muted text-app-text-muted';
}

export function UserTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [coaches, setCoaches] = useState<CoachSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const selectedUser = users.find((user) => user.id === selectedUserId);

  const visibleUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? users.filter((user) => matchesSearch(user, query)) : users;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(userName(a), userName(b), sortDirection);
      if (sortKey === 'email') return compareStrings(a.email, b.email, sortDirection);
      if (sortKey === 'role') return compareStrings(a.role, b.role, sortDirection);
      if (sortKey === 'coach') return compareStrings(coachLabel(a), coachLabel(b), sortDirection);
      return compareDates(a.createdAt, b.createdAt, sortDirection);
    });
  }, [searchQuery, sortDirection, sortKey, users]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection('asc');
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, coachRows] = await Promise.all([
        api<AdminUser[]>('/api/admin/users'),
        api<CoachSummary[]>('/api/admin/coaches').catch(() => [])
      ]);
      setUsers(rows);
      setCoaches(coachRows);
      setSelectedUserId((current) => (current && rows.some((user) => user.id === current) ? current : null));
    } catch (err) {
      setUsers([]);
      setSelectedUserId(null);
      setError(err instanceof Error ? err.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadUsers());
  }, [loadUsers]);

  function handleSaved(updated: AdminUser) {
    setUsers((current) => current.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)));
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Users</h2>
            <p className="text-sm text-app-text-muted">Click a row to edit account details.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search users…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search users"
            />
          )}
          <span className="ml-auto shrink-0 text-sm text-app-text-muted">
            {searchQuery.trim() ? `${visibleUsers.length} of ${users.length}` : `${users.length} total`}
          </span>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading users...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
            {error.toLowerCase().includes('insufficient role') && (
              <p className="mt-2 text-red-700">
                Sign in as <code>admin@metabolic.local</code> to view and manage users.
              </p>
            )}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-app-border text-app-text-muted">
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Email"
                    sortKey="email"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Role"
                    sortKey="role"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="py-3 pr-4 font-medium">Plan</th>
                  <SortableHeader
                    label="Coach"
                    sortKey="coach"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="py-3 pr-4 font-medium">Request</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Phone</th>
                  <SortableHeader
                    label="Joined"
                    sortKey="joined"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const selected = selectedUserId === user.id;
                  return (
                    <tr
                      key={user.id}
                      tabIndex={0}
                      onClick={() => setSelectedUserId(user.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedUserId(user.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-app-border transition last:border-0 ${
                        selected ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/40' : 'hover:bg-app-muted'
                      }`}
                    >
                      <td className="py-3 pr-4 font-semibold">{userName(user)}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{user.email}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{formatRole(user.role)}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{planLabel(user.plan ?? 'starter')}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{coachLabel(user) || '—'}</td>
                      <td className="py-3 pr-4 text-app-text-muted">
                        {user.coachRequestedAt && !user.assignedCoach ? 'Coach requested' : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(user.status)}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-app-text-muted">{user.phone ?? '—'}</td>
                      <td className="py-3 text-app-text-muted">{formatDate(user.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 && <p className="py-6 text-center text-sm text-app-text-muted">No users found.</p>}
            {users.length > 0 && visibleUsers.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No users match your search.</p>
            )}
          </div>
        )}
      </Card>

      <EditUserDrawer
        open={Boolean(selectedUser)}
        user={selectedUser}
        coaches={coaches}
        onClose={() => setSelectedUserId(null)}
        onSaved={handleSaved}
      />
    </>
  );
}
