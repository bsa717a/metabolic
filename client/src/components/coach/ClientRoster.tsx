import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Search, UsersRound } from 'lucide-react';
import type { ClientGroup, CoachClient } from '../../types';
import { todayKey } from '../../services/api';
import { Card } from '../ui/Card';

type RosterFilter = 'all' | 'needs_attention' | 'today';

function clientName(client: CoachClient) {
  return `${client.firstName} ${client.lastName}`;
}

function clientInitials(client: CoachClient) {
  return `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();
}

function daysSince(dateKey: string) {
  const start = new Date(`${dateKey}T12:00:00`);
  const today = new Date(`${todayKey()}T12:00:00`);
  return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function needsAttention(client: CoachClient) {
  return client.needsAttention;
}

function hasSessionToday(client: CoachClient) {
  const next = client.nextSessionAt ?? client.nextCheckInAt;
  if (!next) return false;
  return next.slice(0, 10) === todayKey();
}

function lastActivityLabel(client: CoachClient) {
  const lastDate = client.lastActivityAt ?? client.latestDailyLog?.date ?? client.latestProgressSnapshot?.snapshotDate;
  if (!lastDate) return 'No activity';

  const days = daysSince(lastDate);
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function statusDotClass(client: CoachClient) {
  if (client.needsAttention) return 'bg-red-500';
  const pct = client.compliancePct;
  if (pct == null) return 'bg-amber-400';
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full px-3 py-1 text-xs font-semibold transition',
        active ? 'bg-app-muted text-app-text' : 'text-app-text-muted hover:bg-app-muted/60 hover:text-app-text'
      )}
    >
      {label}
    </button>
  );
}

export function ClientRoster({
  clients,
  totalCount,
  selectedClientId,
  onSelect,
  clientGroups,
  selectedGroupId,
  onGroupChange,
  onManageGroups,
  selectedGroupName
}: {
  clients: CoachClient[];
  totalCount: number;
  selectedClientId: string;
  onSelect: (userId: string) => void;
  clientGroups: ClientGroup[];
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  onManageGroups: () => void;
  selectedGroupName?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');

  const needsAttentionCount = useMemo(() => clients.filter(needsAttention).length, [clients]);
  const todayCount = useMemo(() => clients.filter(hasSessionToday).length, [clients]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients
      .filter((client) => {
        if (query && !clientName(client).toLowerCase().includes(query)) return false;
        if (filter === 'needs_attention' && !needsAttention(client)) return false;
        if (filter === 'today' && !hasSessionToday(client)) return false;
        return true;
      })
      .sort((a, b) => {
        const attentionDiff = Number(needsAttention(b)) - Number(needsAttention(a));
        if (attentionDiff !== 0) return attentionDiff;
        return clientName(a).localeCompare(clientName(b));
      });
  }, [clients, filter, search]);

  return (
    <Card className="flex h-full min-h-[32rem] flex-col p-4 lg:min-h-[calc(100vh-12rem)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Clients</h2>
          <p className="text-xs text-app-text-muted">
            {clients.length} of {totalCount}
            {selectedGroupName ? ` in ${selectedGroupName}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-app-muted px-2.5 py-1 text-xs font-semibold tabular-nums">{totalCount}</span>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search clients..."
          className="w-full rounded-xl border border-app-border bg-app-bg py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip
          label={`Needs attention${needsAttentionCount ? ` ${needsAttentionCount}` : ''}`}
          active={filter === 'needs_attention'}
          onClick={() => setFilter('needs_attention')}
        />
        <FilterChip
          label={`Today${todayCount ? ` ${todayCount}` : ''}`}
          active={filter === 'today'}
          onClick={() => setFilter('today')}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <select
          className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
          value={selectedGroupId}
          onChange={(event) => onGroupChange(event.target.value)}
        >
          <option value="">All groups</option>
          {clientGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount})
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Manage client groups"
          title="Manage client groups"
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-app-border px-3 py-2 text-app-text transition hover:bg-app-muted"
          onClick={onManageGroups}
        >
          <UsersRound className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredClients.length === 0 ? (
          <p className="px-1 py-4 text-sm text-app-text-muted">
            {clients.length === 0
              ? selectedGroupName
                ? `No clients in ${selectedGroupName} yet.`
                : 'No assigned users yet.'
              : 'No clients match this search or filter.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredClients.map((client) => {
              const pct = client.compliancePct;
              const selected = client.id === selectedClientId;

              return (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(client.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition',
                      selected ? 'bg-app-muted' : 'hover:bg-app-muted/60'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-muted text-xs font-bold">
                      {clientInitials(client)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{clientName(client)}</span>
                      <span className="block truncate text-xs text-app-text-muted">
                        {client.activeProgram?.name ?? 'No active program'}
                        {pct != null ? ` · ${pct}% compliance` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={clsx('h-2 w-2 rounded-full', statusDotClass(client))} aria-hidden />
                      <span className="text-[10px] text-app-text-muted tabular-nums">{lastActivityLabel(client)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
