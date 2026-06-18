import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { UsersRound } from 'lucide-react';
import { api, todayKey } from '../services/api';
import type { ClientGroup, CoachClient, Dashboard, ExercisePlanTemplateSummary, NutritionPlanTemplateSummary } from '../types';
import type { GamificationDashboard } from '../types/gamification';
import type { CoachHydrationStats } from '../types/hydration';
import { CoachCalendar } from '../components/coach/CoachCalendar';
import { ClientGroupsDrawer } from '../components/coach/ClientGroupsDrawer';
import { EditAccountDetailsDrawer } from '../components/user/EditAccountDetailsDrawer';
import { SendResultsMenu } from '../components/coach/SendResultsMenu';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

type CoachSettings = {
  coachCode: string | null;
  defaultNutritionTemplateId: string | null;
  defaultExerciseTemplateId: string | null;
};

type CoachEngagement = GamificationDashboard & { hydration: CoachHydrationStats };

type AssignedUsersSortKey = 'name' | 'nextCheckIn';
type SortDirection = 'asc' | 'desc';

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareOptionalDates(a: string | null, b: string | null, direction: SortDirection) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const result = new Date(a).getTime() - new Date(b).getTime();
  return direction === 'asc' ? result : -result;
}

function AssignedUsersSortHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  className = 'py-3 pr-4 font-medium'
}: {
  label: string;
  sortKey: AssignedUsersSortKey;
  activeSortKey: AssignedUsersSortKey;
  sortDirection: SortDirection;
  onSort: (key: AssignedUsersSortKey) => void;
  className?: string;
}) {
  const active = activeSortKey === sortKey;

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={clsx(
          'inline-flex items-center gap-1 transition',
          active ? 'text-app-text' : 'text-app-text-muted hover:text-app-text'
        )}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function clientName(client: CoachClient) {
  return `${client.firstName} ${client.lastName}`;
}

function completion(completed?: number, planned?: number) {
  if (!planned) return 'No plan yet';
  return `${completed ?? 0}/${planned}`;
}

function latestWeight(client: CoachClient) {
  return client.activeProgram?.currentWeight ?? client.latestProgressSnapshot?.weight ?? null;
}

function formatNextCheckIn(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

export function CoachPage({ coachUserId }: { coachUserId: string }) {
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [engagement, setEngagement] = useState<CoachEngagement | null>(null);
  const [clientWaterGoalDraft, setClientWaterGoalDraft] = useState('64');
  const [nutritionTemplates, setNutritionTemplates] = useState<NutritionPlanTemplateSummary[]>([]);
  const [exerciseTemplates, setExerciseTemplates] = useState<ExercisePlanTemplateSummary[]>([]);
  const [nutritionTemplateId, setNutritionTemplateId] = useState('');
  const [exerciseTemplateId, setExerciseTemplateId] = useState('');
  const [coachCodeDraft, setCoachCodeDraft] = useState('');
  const [defaultNutritionTemplateId, setDefaultNutritionTemplateId] = useState('');
  const [defaultExerciseTemplateId, setDefaultExerciseTemplateId] = useState('');
  const [applyDate, setApplyDate] = useState(() => todayKey());
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'list' | 'calendar'>('list');
  const [assignedUsersSortKey, setAssignedUsersSortKey] = useState<AssignedUsersSortKey>('name');
  const [assignedUsersSortDirection, setAssignedUsersSortDirection] = useState<SortDirection>('asc');
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);

  const selectedGroup = useMemo(
    () => clientGroups.find((group) => group.id === selectedGroupId) ?? null,
    [clientGroups, selectedGroupId]
  );

  const visibleClients = useMemo(() => {
    if (!selectedGroup) return clients;
    const memberIds = new Set(selectedGroup.memberIds);
    return clients.filter((client) => memberIds.has(client.id));
  }, [clients, selectedGroup]);

  const sortedVisibleClients = useMemo(() => {
    return [...visibleClients].sort((a, b) => {
      if (assignedUsersSortKey === 'name') {
        return compareStrings(clientName(a), clientName(b), assignedUsersSortDirection);
      }
      return compareOptionalDates(a.nextCheckInAt, b.nextCheckInAt, assignedUsersSortDirection);
    });
  }, [assignedUsersSortDirection, assignedUsersSortKey, visibleClients]);

  function handleAssignedUsersSort(nextKey: AssignedUsersSortKey) {
    if (assignedUsersSortKey === nextKey) {
      setAssignedUsersSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAssignedUsersSortKey(nextKey);
    setAssignedUsersSortDirection('asc');
  }

  const selectedClient = useMemo(
    () => visibleClients.find((client) => client.id === selectedClientId) ?? visibleClients[0],
    [visibleClients, selectedClientId]
  );

  const loadGroups = useCallback(async () => {
    const groupRows = await api<ClientGroup[]>('/api/coach/client-groups');
    setClientGroups(groupRows);
    setSelectedGroupId((current) => (current && groupRows.some((group) => group.id === current) ? current : ''));
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const clientRows = await api<CoachClient[]>('/api/coach/users');
      setClients(clientRows);
    } catch {
      // Keep the existing list if a background refresh fails.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clientRows, nutritionRows, exerciseRows] = await Promise.all([
        api<CoachClient[]>('/api/coach/users'),
        api<NutritionPlanTemplateSummary[]>('/api/coach/nutrition-templates'),
        api<ExercisePlanTemplateSummary[]>('/api/coach/exercise-templates')
      ]);
      const [coachSettings, groupRows] = await Promise.all([
        api<CoachSettings>('/api/coach/settings'),
        api<ClientGroup[]>('/api/coach/client-groups').catch(() => [] as ClientGroup[])
      ]);
      setClients(clientRows);
      setClientGroups(groupRows);
      setNutritionTemplates(nutritionRows);
      setExerciseTemplates(exerciseRows);
      setCoachCodeDraft(coachSettings.coachCode ?? '');
      setDefaultNutritionTemplateId(coachSettings.defaultNutritionTemplateId ?? '');
      setDefaultExerciseTemplateId(coachSettings.defaultExerciseTemplateId ?? '');
      setSelectedClientId((current) => current || clientRows[0]?.id || '');
      setSelectedGroupId((current) => (current && groupRows.some((group) => group.id === current) ? current : ''));
      setNutritionTemplateId((current) => current || nutritionRows[0]?.id || '');
      setExerciseTemplateId((current) => current || exerciseRows[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load coach workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (clientId: string) => {
    if (!clientId) {
      setDashboard(null);
      setEngagement(null);
      return;
    }
    try {
      const [dashboardData, engagementData] = await Promise.all([
        api<Dashboard>(`/api/coach/users/${clientId}/dashboard`),
        api<CoachEngagement>(`/api/coach/users/${clientId}/engagement`)
      ]);
      setDashboard(dashboardData);
      setEngagement(engagementData);
      setClientWaterGoalDraft(String(engagementData.hydration.waterGoalOz));
    } catch {
      setDashboard(null);
      setEngagement(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDashboard(selectedClient?.id ?? '');
  }, [loadDashboard, selectedClient?.id]);

  useEffect(() => {
    if (!selectedClientId) return;
    if (visibleClients.some((client) => client.id === selectedClientId)) return;
    setSelectedClientId(visibleClients[0]?.id ?? '');
  }, [selectedClientId, visibleClients]);

  async function saveClientWaterGoal() {
    if (!selectedClient) return;
    const goalOz = Number(clientWaterGoalDraft);
    if (!Number.isFinite(goalOz) || goalOz < 1) {
      setError('Enter a valid hydration goal in ounces');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/api/coach/users/${selectedClient.id}/hydration-goal`, {
        method: 'PATCH',
        body: JSON.stringify({ goalOz })
      });
      await loadDashboard(selectedClient.id);
      setSuccessMessage(`Updated hydration goal for ${clientName(selectedClient)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update hydration goal');
    } finally {
      setSaving(false);
    }
  }

  async function applyTemplate(kind: 'nutrition' | 'exercise') {
    if (!selectedClient) return;
    const templateId = kind === 'nutrition' ? nutritionTemplateId : exerciseTemplateId;
    if (!templateId) {
      setError(`Choose a ${kind} template first.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const path =
        kind === 'nutrition'
          ? `/api/coach/users/${selectedClient.id}/daily-logs/${applyDate}/apply-template`
          : `/api/coach/users/${selectedClient.id}/daily-logs/${applyDate}/apply-exercise-template`;
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ templateId, setAsDefault })
      });
      await Promise.all([load(), loadDashboard(selectedClient.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to apply ${kind} template`);
    } finally {
      setSaving(false);
    }
  }

  function handleCalendarSelectClient(userId: string) {
    setSelectedClientId(userId);
    setWorkspaceView('list');
  }

  async function sendResultsEmail() {
    if (!selectedClient) return;
    const confirmed = window.confirm(
      `Send a results-ready email to ${clientName(selectedClient)} at ${selectedClient.email}?`
    );
    if (!confirmed) return;

    setSendingEmail(true);
    setError('');
    setSuccessMessage('');
    try {
      const result = await api<{ sent: boolean; to: string }>(
        `/api/coach/users/${selectedClient.id}/send-results-email`,
        { method: 'POST' }
      );
      setSuccessMessage(`Results email sent to ${result.to}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send results email');
    } finally {
      setSendingEmail(false);
    }
  }

  async function sendResultsSms() {
    if (!selectedClient) return;

    let phone = selectedClient.textPhone ?? selectedClient.phone?.trim() ?? '';
    let savePhone = false;
    if (!phone) {
      const entered = window.prompt(
        'This client has no phone on file. Enter their personal mobile number in E.164 format (e.g. +15551234567). Do not use the Master Metabolic business/WhatsApp number.'
      );
      if (!entered?.trim()) return;
      phone = entered.trim();
      savePhone = true;
    }

    const confirmed = window.confirm(`Send a results-ready text to ${clientName(selectedClient)} at ${phone}?`);
    if (!confirmed) return;

    setSendingSms(true);
    setError('');
    setSuccessMessage('');
    try {
      const result = await api<{ sent: boolean; to: string }>(
        `/api/coach/users/${selectedClient.id}/send-results-sms`,
        {
          method: 'POST',
          body: JSON.stringify(savePhone ? { phone, savePhone: true } : undefined)
        }
      );
      setSuccessMessage(`Results text sent to ${result.to}.`);
      if (savePhone) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send results text');
    } finally {
      setSendingSms(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    try {
      const updated = await api<CoachSettings>('/api/coach/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          coachCode: coachCodeDraft.trim() || null,
          defaultNutritionTemplateId: defaultNutritionTemplateId || null,
          defaultExerciseTemplateId: defaultExerciseTemplateId || null
        })
      });
      setCoachCodeDraft(updated.coachCode ?? '');
      setDefaultNutritionTemplateId(updated.defaultNutritionTemplateId ?? '');
      setDefaultExerciseTemplateId(updated.defaultExerciseTemplateId ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save coach settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-app-text-muted">Loading coach workspace...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Coach Workspace</h1>
          <p className="text-app-text-muted">Manage assigned users, review progress, and apply plans.</p>
        </div>
        {clients.length > 0 && (
          <div className="inline-flex rounded-xl border border-app-border p-1">
            <button
              type="button"
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                workspaceView === 'list' ? 'bg-app-muted text-app-text' : 'text-app-text-muted hover:text-app-text'
              )}
              onClick={() => setWorkspaceView('list')}
            >
              List
            </button>
            <button
              type="button"
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                workspaceView === 'calendar' ? 'bg-app-muted text-app-text' : 'text-app-text-muted hover:text-app-text'
              )}
              onClick={() => setWorkspaceView('calendar')}
            >
              Calendar
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p>{successMessage}</p>
        </div>
      )}

      {clients.length === 0 ? (
        <>
          <CoachSettingsCard
            coachCodeDraft={coachCodeDraft}
            defaultNutritionTemplateId={defaultNutritionTemplateId}
            defaultExerciseTemplateId={defaultExerciseTemplateId}
            nutritionTemplates={nutritionTemplates}
            exerciseTemplates={exerciseTemplates}
            saving={saving}
            onCoachCodeChange={setCoachCodeDraft}
            onDefaultNutritionTemplateChange={setDefaultNutritionTemplateId}
            onDefaultExerciseTemplateChange={setDefaultExerciseTemplateId}
            onSave={() => void saveSettings()}
          />
          <Card>
            <h2 className="text-lg font-bold">No assigned users yet</h2>
            <p className="mt-2 text-sm text-app-text-muted">Share your coach code or wait for a super admin to assign users.</p>
          </Card>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="space-y-4">
            {workspaceView === 'list' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
                    value={selectedGroupId}
                    onChange={(event) => setSelectedGroupId(event.target.value)}
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
                    className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl px-3.5 py-2.5 text-app-text transition hover:bg-app-muted"
                    onClick={() => setGroupsOpen(true)}
                  >
                    <UsersRound className="h-[1.375rem] w-[1.375rem]" />
                  </button>
                </div>
                <select
                  className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
                  value={selectedClient?.id ?? ''}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                >
                  {visibleClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {clientName(client)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {workspaceView === 'calendar' ? (
              <CoachCalendar
                coachUserId={coachUserId}
                clients={visibleClients}
                scheduleClients={clients}
                clientGroups={clientGroups}
                groupId={selectedGroupId}
                onGroupChange={setSelectedGroupId}
                onManageGroups={() => setGroupsOpen(true)}
                onSelectClient={handleCalendarSelectClient}
                onCheckInsChanged={loadClients}
              />
            ) : (
              <>
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Assigned users</h2>
                  <p className="text-sm text-app-text-muted">
                    {visibleClients.length} of {clients.length} client{clients.length === 1 ? '' : 's'}
                    {selectedGroup ? ` in ${selectedGroup.name}` : ''}
                  </p>
                </div>
              </div>

              {visibleClients.length === 0 ? (
                <p className="text-sm text-app-text-muted">
                  {selectedGroup
                    ? `No clients in ${selectedGroup.name} yet. Use the groups icon to add members.`
                    : 'No assigned users match this filter.'}
                </p>
              ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-app-border text-app-text-muted">
                      <AssignedUsersSortHeader
                        label="Name"
                        sortKey="name"
                        activeSortKey={assignedUsersSortKey}
                        sortDirection={assignedUsersSortDirection}
                        onSort={handleAssignedUsersSort}
                      />
                      <th className="py-3 pr-4 font-medium">Program</th>
                      <th className="py-3 pr-4 font-medium">Meals</th>
                      <th className="py-3 pr-4 font-medium">Exercise</th>
                      <th className="py-3 pr-4 font-medium">Latest weight</th>
                      <AssignedUsersSortHeader
                        label="Next check-in"
                        sortKey="nextCheckIn"
                        activeSortKey={assignedUsersSortKey}
                        sortDirection={assignedUsersSortDirection}
                        onSort={handleAssignedUsersSort}
                        className="py-3 font-medium"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVisibleClients.map((client) => (
                      <tr
                        key={client.id}
                        className={`cursor-pointer border-b border-app-border/60 last:border-0 ${
                          selectedClient?.id === client.id ? 'bg-app-muted' : 'hover:bg-app-muted/60'
                        }`}
                        onClick={() => setSelectedClientId(client.id)}
                      >
                        <td className="py-3 pr-4 font-semibold">{clientName(client)}</td>
                        <td className="py-3 pr-4 text-app-text-muted">{client.activeProgram?.name ?? 'No active program'}</td>
                        <td className="py-3 pr-4 text-app-text-muted">
                          {completion(client.latestDailyLog?.mealsCompleted, client.latestDailyLog?.mealsPlanned)}
                        </td>
                        <td className="py-3 pr-4 text-app-text-muted">
                          {completion(client.latestDailyLog?.exercisesCompleted, client.latestDailyLog?.exercisesPlanned)}
                        </td>
                        <td className="py-3 pr-4 text-app-text-muted">
                          {latestWeight(client) != null ? `${latestWeight(client)} lbs` : '—'}
                        </td>
                        <td className="py-3 text-app-text-muted tabular-nums">{formatNextCheckIn(client.nextCheckInAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </Card>

            {selectedClient && (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-bold">{clientName(selectedClient)} progress</h2>
                  <SendResultsMenu
                    disabled={saving}
                    sendingEmail={sendingEmail}
                    sendingSms={sendingSms}
                    onSendEmail={sendResultsEmail}
                    onSendText={sendResultsSms}
                  />
                </div>
                <p className="mt-2 text-sm text-app-text-muted">
                  {selectedClient.textPhone
                    ? `Text will go to ${selectedClient.textPhone}.`
                    : 'No phone on file yet — add one in account details or when sending results.'}
                </p>
                {dashboard?.summary ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-app-muted p-3">
                        <p className="text-xs uppercase text-app-text-muted">Current weight</p>
                        <p className="mt-1 text-xl font-bold">{Math.round(dashboard.summary.currentWeight)} lbs</p>
                      </div>
                      <div className="rounded-xl bg-app-muted p-3">
                        <p className="text-xs uppercase text-app-text-muted">Goal progress</p>
                        <p className="mt-1 text-xl font-bold">{Math.round(dashboard.summary.goalProgress)}%</p>
                      </div>
                      <div className="rounded-xl bg-app-muted p-3">
                        <p className="text-xs uppercase text-app-text-muted">Calories left</p>
                        <p className="mt-1 text-xl font-bold">{Math.round(dashboard.summary.caloriesRemaining)}</p>
                      </div>
                      <div className="rounded-xl bg-app-muted p-3">
                        <p className="text-xs uppercase text-app-text-muted">Exercises left</p>
                        <p className="mt-1 text-xl font-bold">{dashboard.summary.exercisesLeft}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="rounded-xl bg-app-muted p-4">
                        <p className="text-xs uppercase text-app-text-muted">Current level</p>
                        {engagement?.currentLevel ? (
                          <>
                            <p className="mt-1 text-lg font-bold">
                              Level {engagement.currentLevel.number}: {engagement.currentLevel.name}
                            </p>
                            <p className="mt-1 text-sm text-app-text-muted">{engagement.currentLevel.progressPercent}% complete</p>
                            <p className="mt-2 text-sm">Next: {engagement.currentLevel.nextAction}</p>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-app-text-muted">No level activity yet.</p>
                        )}
                      </div>

                      <div className="rounded-xl bg-app-muted p-4">
                        <p className="text-xs uppercase text-app-text-muted">Streaks</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-app-text-muted">Food</p>
                            <p className="text-lg font-bold">{engagement?.momentum.foodLoggingStreak ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-app-text-muted">Best</p>
                            <p className="text-lg font-bold">{engagement?.momentum.foodLoggingBest ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-app-text-muted">Snapshots</p>
                            <p className="text-lg font-bold">{engagement?.momentum.snapshotStreak ?? 0}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-app-text-muted">
                          {engagement?.momentum.dailyWinsThisWeek ?? 0} daily wins this week
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-app-muted p-4">
                      <p className="text-xs uppercase text-app-text-muted">Hydration</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-app-text-muted">Today</p>
                          <p className="text-lg font-bold tabular-nums">
                            {engagement?.hydration.todayActualOz ?? 0}/{engagement?.hydration.todayTargetOz ?? 0} oz
                          </p>
                        </div>
                        <div>
                          <p className="text-app-text-muted">30-day hit rate</p>
                          <p className="text-lg font-bold tabular-nums">
                            {engagement?.hydration.last30DayHitPercent ?? 0}%
                          </p>
                        </div>
                        <div>
                          <p className="text-app-text-muted">Streak</p>
                          <p className="text-lg font-bold tabular-nums">{engagement?.hydration.currentStreak ?? 0} days</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-end gap-2">
                        <label className="text-sm text-app-text-muted">
                          Daily goal (oz)
                          <input
                            type="number"
                            min={1}
                            max={512}
                            value={clientWaterGoalDraft}
                            onChange={(event) => setClientWaterGoalDraft(event.target.value)}
                            className="mt-1 block w-28 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
                          />
                        </label>
                        <Button disabled={saving} onClick={() => void saveClientWaterGoal()}>
                          Save hydration goal
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl bg-app-muted p-4">
                      <p className="text-xs uppercase text-app-text-muted">Recent badges</p>
                      {engagement?.recentBadges.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {engagement.recentBadges.map((badge) => (
                            <span key={badge.id} className="rounded-full bg-app-surface px-3 py-1 text-sm font-semibold">
                              {badge.icon} {badge.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-app-text-muted">No badges earned yet.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-app-text-muted">No dashboard data available for this user yet.</p>
                )}
              </Card>
            )}
              </>
            )}
          </div>

          <div className="space-y-6">
            {selectedClient ? (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Account details</h2>
                    <p className="mt-1 text-sm text-app-text-muted">
                      Health profile, allergies, restrictions, and coach notes for {clientName(selectedClient)}.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setAccountDetailsOpen(true)}>
                    Edit account details
                  </Button>
                </div>
              </Card>
            ) : null}

            <CoachSettingsCard
              coachCodeDraft={coachCodeDraft}
              defaultNutritionTemplateId={defaultNutritionTemplateId}
              defaultExerciseTemplateId={defaultExerciseTemplateId}
              nutritionTemplates={nutritionTemplates}
              exerciseTemplates={exerciseTemplates}
              saving={saving}
              onCoachCodeChange={setCoachCodeDraft}
              onDefaultNutritionTemplateChange={setDefaultNutritionTemplateId}
              onDefaultExerciseTemplateChange={setDefaultExerciseTemplateId}
              onSave={() => void saveSettings()}
            />

            <Card>
              <h2 className="text-lg font-bold">Apply plans</h2>
              <p className="mt-1 text-sm text-app-text-muted">Apply templates to the selected user's day and optionally make them defaults.</p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Plan date</span>
              <input
                type="date"
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                value={applyDate}
                onChange={(event) => setApplyDate(event.target.value)}
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={setAsDefault} onChange={(event) => setSetAsDefault(event.target.checked)} />
              Set as the user&apos;s default going forward
            </label>

            <div className="mt-5 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nutrition template</span>
                <select
                  className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                  value={nutritionTemplateId}
                  onChange={(event) => setNutritionTemplateId(event.target.value)}
                >
                  {nutritionTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" className="w-full" disabled={saving || !nutritionTemplates.length} onClick={() => void applyTemplate('nutrition')}>
                Apply nutrition template
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Exercise template</span>
                <select
                  className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                  value={exerciseTemplateId}
                  onChange={(event) => setExerciseTemplateId(event.target.value)}
                >
                  {exerciseTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" className="w-full" disabled={saving || !exerciseTemplates.length} onClick={() => void applyTemplate('exercise')}>
                Apply exercise template
              </Button>
            </div>
            </Card>
          </div>
        </div>
      )}

      <ClientGroupsDrawer
        open={groupsOpen}
        clients={clients}
        groups={clientGroups}
        onClose={() => setGroupsOpen(false)}
        onGroupsChange={loadGroups}
      />

      {selectedClient ? (
        <EditAccountDetailsDrawer
          open={accountDetailsOpen}
          userId={selectedClient.id}
          title={`${clientName(selectedClient)} account details`}
          mode="coach"
          onClose={() => setAccountDetailsOpen(false)}
          onSaved={() => void loadClients()}
        />
      ) : null}
    </div>
  );
}

function CoachSettingsCard({
  coachCodeDraft,
  defaultNutritionTemplateId,
  defaultExerciseTemplateId,
  nutritionTemplates,
  exerciseTemplates,
  saving,
  onCoachCodeChange,
  onDefaultNutritionTemplateChange,
  onDefaultExerciseTemplateChange,
  onSave
}: {
  coachCodeDraft: string;
  defaultNutritionTemplateId: string;
  defaultExerciseTemplateId: string;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  exerciseTemplates: ExercisePlanTemplateSummary[];
  saving: boolean;
  onCoachCodeChange: (value: string) => void;
  onDefaultNutritionTemplateChange: (value: string) => void;
  onDefaultExerciseTemplateChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">New user defaults</h2>
      <p className="mt-1 text-sm text-app-text-muted">Users can enter your code during setup to get assigned and start on these plans.</p>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Coach code</span>
        <input
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 uppercase"
          value={coachCodeDraft}
          onChange={(event) => onCoachCodeChange(event.target.value.toUpperCase())}
          placeholder="DF"
          maxLength={20}
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Default nutrition plan</span>
        <select
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
          value={defaultNutritionTemplateId}
          onChange={(event) => onDefaultNutritionTemplateChange(event.target.value)}
        >
          <option value="">Use global starter plan</option>
          {nutritionTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Default exercise plan</span>
        <select
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
          value={defaultExerciseTemplateId}
          onChange={(event) => onDefaultExerciseTemplateChange(event.target.value)}
        >
          <option value="">Use global starter plan</option>
          {exerciseTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <Button type="button" className="mt-4 w-full" disabled={saving} onClick={onSave}>
        {saving ? 'Saving...' : 'Save defaults'}
      </Button>
    </Card>
  );
}
