import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Eraser, Loader2, Search } from 'lucide-react';
import {
  fetchAllCommunicationUsers,
  fetchCommunicationUsers,
  fetchFilterOptions,
  type FilterOptions
} from '../../services/communicationsApi';
import type { CommunicationUser, RecipientInput } from '../../lib/communications/types';

const SUBSCRIPTION_FILTERS = [
  { value: 'all', label: 'All users' },
  { value: 'subscribed', label: 'Subscribed' },
  { value: 'unsubscribed', label: 'Unsubscribed' }
];

const EMPTY_FILTER_OPTIONS: FilterOptions = { organizations: [], roles: [], plans: [], statuses: [] };

const toRecipient = (user: CommunicationUser): RecipientInput => ({
  userId: user.userId,
  displayName: user.displayName,
  email: user.email,
  phone: user.phone,
  isExternal: false
});

interface UsersTabProps {
  selectedUsers: RecipientInput[];
  onSelectionChange: (users: RecipientInput[]) => void;
}

const fieldClasses =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

export default function UsersTab({ selectedUsers, onSelectionChange }: UsersTabProps) {
  const [users, setUsers] = useState<CommunicationUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [subscription, setSubscription] = useState('all');
  const [organizationId, setOrganizationId] = useState('');
  const [role, setRole] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectingAll, setSelectingAll] = useState(false);
  const [notice, setNotice] = useState('');

  const selectedIds = new Set(selectedUsers.map((u) => u.userId));

  const filterParams = {
    q: appliedSearch || undefined,
    organizationId: organizationId || undefined,
    role: role || undefined,
    plan: plan || undefined,
    status: status || undefined,
    subscription
  };

  useEffect(() => {
    fetchFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions(EMPTY_FILTER_OPTIONS));
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommunicationUsers({
        ...filterParams,
        limit: rowsPerPage,
        offset: page * rowsPerPage
      });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterParams fields listed below
  }, [appliedSearch, organizationId, role, plan, status, subscription, page, rowsPerPage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleToggleUser = (user: CommunicationUser, checked: boolean) => {
    if (checked) {
      if (selectedIds.has(user.userId)) return;
      onSelectionChange([...selectedUsers, toRecipient(user)]);
      return;
    }
    onSelectionChange(selectedUsers.filter((u) => u.userId !== user.userId));
  };

  const handleTogglePage = (checked: boolean) => {
    if (checked) {
      const merged = [...selectedUsers];
      const mergedIds = new Set(merged.map((u) => u.userId));
      users.forEach((user) => {
        if (!mergedIds.has(user.userId)) merged.push(toRecipient(user));
      });
      onSelectionChange(merged);
      return;
    }
    const pageIds = new Set(users.map((u) => u.userId));
    onSelectionChange(selectedUsers.filter((u) => !(u.userId != null && pageIds.has(u.userId))));
  };

  const handleSelectAllMatching = async () => {
    setSelectingAll(true);
    setNotice('');
    try {
      const { recipients, total: matched, truncated } = await fetchAllCommunicationUsers(filterParams);
      onSelectionChange(recipients);
      setNotice(
        truncated
          ? `Selected the first ${recipients.length} of ${matched} matching users (selection limit reached).`
          : `Selected all ${recipients.length} matching user${recipients.length === 1 ? '' : 's'}.`
      );
    } catch {
      setNotice('Could not select all matching users. Please try again.');
    } finally {
      setSelectingAll(false);
    }
  };

  const pageAllSelected = users.length > 0 && users.every((u) => selectedIds.has(u.userId));
  const totalPages = Math.max(Math.ceil(total / rowsPerPage), 1);

  const handleApplySearch = () => {
    setPage(0);
    setAppliedSearch(searchInput.trim());
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApplySearch();
            }
          }}
          placeholder="Name, email, or phone"
          aria-label="Search users"
          className={`${fieldClasses} w-full sm:w-56`}
        />
        <button
          type="button"
          onClick={handleApplySearch}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
        <select
          value={organizationId}
          onChange={(e) => {
            setOrganizationId(e.target.value);
            setPage(0);
          }}
          aria-label="Organization filter"
          className={`${fieldClasses} max-w-[14rem]`}
        >
          <option value="">All organizations</option>
          {filterOptions.organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
          aria-label="Role filter"
          className={`${fieldClasses} max-w-[12rem]`}
        >
          <option value="">All roles</option>
          {filterOptions.roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setPage(0);
          }}
          aria-label="Plan filter"
          className={`${fieldClasses} max-w-[12rem]`}
        >
          <option value="">All plans</option>
          {filterOptions.plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          aria-label="Status filter"
          className={`${fieldClasses} max-w-[12rem]`}
        >
          <option value="">All statuses</option>
          {filterOptions.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={subscription}
          onChange={(e) => {
            setSubscription(e.target.value);
            setPage(0);
          }}
          aria-label="Subscription filter"
          className={fieldClasses}
        >
          {SUBSCRIPTION_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSelectAllMatching()}
          disabled={selectingAll || total === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {selectingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
        </button>
        {selectedUsers.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => {
                onSelectionChange([]);
                setNotice('');
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <Eraser className="h-4 w-4" />
              Clear selection
            </button>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {selectedUsers.length} user{selectedUsers.length === 1 ? '' : 's'} selected
            </span>
          </>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">{notice}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2">
                    <input type="checkbox" checked={pageAllSelected} onChange={(e) => handleTogglePage(e.target.checked)} aria-label="Select all users on page" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Organization</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Role</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Plan</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500 dark:text-slate-400">
                      No users match your filters.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.userId)}
                          onChange={(e) => handleToggleUser(user, e.target.checked)}
                          aria-label={`Select ${user.displayName}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{user.displayName}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{user.email || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{user.organizationName || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{user.role || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{user.plan || '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.isSubscribed
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                          }`}
                        >
                          {user.isSubscribed ? 'Subscribed' : 'Unsubscribed'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <span>Rows:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                className={fieldClasses}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span>
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0}
                className="rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages}
                className="rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-600"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
