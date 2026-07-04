import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Settings } from 'lucide-react';
import { api, todayKey } from '../services/api';
import type { ClientGroup, CoachClient, CoachClientPlanStatus, Dashboard, ExercisePlanTemplateSummary, NutritionPlanTemplateSummary, ProgramMetricSnapshot } from '../types';
import type { GamificationDashboard } from '../types/gamification';
import type { CoachHydrationStats } from '../types/hydration';
import { CoachCalendar } from '../components/coach/CoachCalendar';
import { ClientDetailTabs } from '../components/coach/ClientDetailTabs';
import { ClientGroupsDrawer } from '../components/coach/ClientGroupsDrawer';
import { ClientRoster } from '../components/coach/ClientRoster';
import { CoachSettingsDrawer } from '../components/coach/CoachSettingsDrawer';
import { ScheduleCheckInDrawer } from '../components/coach/ScheduleCheckInDrawer';
import { CoachSnapshotPreview } from '../components/coach/CoachSnapshotPreview';
import { SessionNotesPanel } from '../components/coach/SessionNotesPanel';
import { EditAccountDetailsDrawer } from '../components/user/EditAccountDetailsDrawer';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { clientName } from '../utils/coachClientUtils';

type CoachSettings = {
  coachCode: string | null;
  defaultNutritionTemplateId: string | null;
  defaultExerciseTemplateId: string | null;
};

type CoachEngagement = GamificationDashboard & { hydration: CoachHydrationStats };

export function CoachPage({ coachUserId }: { coachUserId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [planStatus, setPlanStatus] = useState<CoachClientPlanStatus | null>(null);
  const [engagement, setEngagement] = useState<CoachEngagement | null>(null);
  const [clientWaterGoalDraft, setClientWaterGoalDraft] = useState('64');
  const [nutritionTemplates, setNutritionTemplates] = useState<NutritionPlanTemplateSummary[]>([]);
  const [clientNutritionTemplates, setClientNutritionTemplates] = useState<NutritionPlanTemplateSummary[]>([]);
  const [exerciseTemplates, setExerciseTemplates] = useState<ExercisePlanTemplateSummary[]>([]);
  const [coachCodeDraft, setCoachCodeDraft] = useState('');
  const [defaultNutritionTemplateId, setDefaultNutritionTemplateId] = useState('');
  const [defaultExerciseTemplateId, setDefaultExerciseTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'list' | 'calendar'>(() =>
    searchParams.get('view') === 'calendar' ? 'calendar' : 'list'
  );
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<ProgramMetricSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const clearDeepLinkParams = useCallback(() => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('view');
        next.delete('date');
        next.delete('checkIn');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (searchParams.get('view') === 'calendar') {
      setWorkspaceView('calendar');
    }
  }, [searchParams]);

  const deepLinkDate = searchParams.get('date');
  const deepLinkCheckInId = searchParams.get('checkIn');
  const deepLinkClientId = searchParams.get('client');

  useEffect(() => {
    if (!deepLinkCheckInId || !deepLinkClientId) return;
    if (!clients.some((client) => client.id === deepLinkClientId)) return;
    setSelectedGroupId('');
    setSelectedClientId(deepLinkClientId);
  }, [clients, deepLinkCheckInId, deepLinkClientId]);

  const selectedGroup = useMemo(
    () => clientGroups.find((group) => group.id === selectedGroupId) ?? null,
    [clientGroups, selectedGroupId]
  );

  const visibleClients = useMemo(() => {
    if (!selectedGroup) return clients;
    const memberIds = new Set(selectedGroup.memberIds);
    return clients.filter((client) => memberIds.has(client.id));
  }, [clients, selectedGroup]);

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return visibleClients[0] ?? clients[0] ?? null;
    return clients.find((client) => client.id === selectedClientId) ?? null;
  }, [clients, visibleClients, selectedClientId]);

  const handleSelectClient = useCallback(
    (userId: string) => {
      if (!userId) {
        setSelectedClientId('');
        return;
      }
      setSelectedClientId(userId);
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.set('client', userId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
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

  const loadSnapshots = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgramMetricSnapshot[]>(`/api/programs/${programId}/metric-snapshots`);
      setSnapshots(rows);
      setSelectedSnapshotId((current) => (current && rows.some((row) => row.id === current) ? current : null));
    } catch {
      setSnapshots([]);
      setSelectedSnapshotId(null);
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
      setSelectedGroupId((current) => (current && groupRows.some((group) => group.id === current) ? current : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load coach workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  // "No active program" is an expected empty state (client not enrolled) → null, no error.
  // Any other failure (network, 403, 500) is surfaced instead of silently hiding the panel.
  const fetchClientPlanStatus = useCallback(async (clientId: string) => {
    try {
      return await api<CoachClientPlanStatus>(`/api/coach/users/${clientId}/plan-status`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load plan status';
      if (message !== 'No active program') setError(message);
      return null;
    }
  }, []);

  const loadDashboard = useCallback(async (clientId: string) => {
    if (!clientId) {
      setDashboard(null);
      setPlanStatus(null);
      setEngagement(null);
      return;
    }
    try {
      const [dashboardData, engagementData, planStatusData] = await Promise.all([
        api<Dashboard>(`/api/coach/users/${clientId}/dashboard`),
        api<CoachEngagement>(`/api/coach/users/${clientId}/engagement`),
        fetchClientPlanStatus(clientId)
      ]);
      setDashboard(dashboardData);
      setEngagement(engagementData);
      setPlanStatus(planStatusData);
      setClientWaterGoalDraft(String(engagementData.hydration.waterGoalOz));
    } catch {
      setDashboard(null);
      setPlanStatus(null);
      setEngagement(null);
    }
  }, [fetchClientPlanStatus]);

  const refreshPlanStatus = useCallback(async () => {
    if (!selectedClientId) return;
    setPlanStatus(await fetchClientPlanStatus(selectedClientId));
  }, [selectedClientId, fetchClientPlanStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !clients.length) return;

    const fromUrl = searchParams.get('client');
    if (fromUrl && clients.some((client) => client.id === fromUrl)) {
      setSelectedClientId(fromUrl);
      return;
    }

    setSelectedClientId((current) => {
      if (current && visibleClients.some((client) => client.id === current)) return current;
      return visibleClients[0]?.id ?? '';
    });
  }, [loading, searchParams, visibleClients]);

  useEffect(() => {
    if (!selectedClientId) {
      setClientNutritionTemplates([]);
      return;
    }
    void api<NutritionPlanTemplateSummary[]>(
      `/api/coach/nutrition-templates?clientId=${encodeURIComponent(selectedClientId)}`
    )
      .then(setClientNutritionTemplates)
      .catch(() => setClientNutritionTemplates([]));
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClient) {
      setDashboard(null);
      setEngagement(null);
      return;
    }
    void loadDashboard(selectedClient.id);
  }, [loadDashboard, selectedClient]);

  useEffect(() => {
    setSelectedSnapshotId(null);
  }, [selectedClient?.id]);

  useEffect(() => {
    if (!dashboard?.program?.id) {
      setSnapshots([]);
      return;
    }
    void loadSnapshots(dashboard.program.id);
  }, [dashboard?.program?.id, loadSnapshots]);

  useEffect(() => {
    if (!selectedClientId) return;
    if (visibleClients.some((client) => client.id === selectedClientId)) return;
    const fallbackId = visibleClients[0]?.id;
    if (fallbackId) handleSelectClient(fallbackId);
    else setSelectedClientId('');
  }, [handleSelectClient, selectedClientId, visibleClients]);

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

  async function refreshClientData() {
    if (!selectedClient) return;
    const programId = dashboard?.program?.id;
    await Promise.all([
      load(),
      loadDashboard(selectedClient.id),
      loadClients(),
      programId ? loadSnapshots(programId) : Promise.resolve()
    ]);
  }

  function handleSnapshotUpdated(updated: ProgramMetricSnapshot) {
    setSnapshots((current) => {
      const index = current.findIndex((snapshot) => snapshot.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.date.localeCompare(a.date));
      return current.map((snapshot) => (snapshot.id === updated.id ? updated : snapshot));
    });
  }

  function handleCalendarSelectClient(userId: string) {
    handleSelectClient(userId);
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Coach settings"
            title="Coach settings"
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-app-border px-3.5 py-2.5 text-app-text transition hover:bg-app-muted"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-[1.375rem] w-[1.375rem]" />
          </button>
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
        <Card>
          <h2 className="text-lg font-bold">No assigned users yet</h2>
          <p className="mt-2 text-sm text-app-text-muted">
            Share your coach code or wait for a super admin to assign users. Open coach settings to configure your code and default plans.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(280px,340px)]">
          <ClientRoster
            clients={visibleClients}
            totalCount={clients.length}
            selectedClientId={selectedClient?.id ?? ''}
            onSelect={handleSelectClient}
            clientGroups={clientGroups}
            selectedGroupId={selectedGroupId}
            onGroupChange={setSelectedGroupId}
            onManageGroups={() => setGroupsOpen(true)}
            selectedGroupName={selectedGroup?.name}
          />

          <div className="min-w-0 space-y-4">
            {workspaceView === 'calendar' ? (
              <CoachCalendar
                coachUserId={coachUserId}
                clients={visibleClients}
                scheduleClients={clients}
                clientGroups={clientGroups}
                groupId={deepLinkCheckInId ? '' : selectedGroupId}
                onGroupChange={setSelectedGroupId}
                onManageGroups={() => setGroupsOpen(true)}
                onSelectClient={handleCalendarSelectClient}
                onCheckInsChanged={loadClients}
                deepLinkDate={deepLinkDate}
                deepLinkCheckInId={deepLinkCheckInId}
                onDeepLinkConsumed={clearDeepLinkParams}
              />
            ) : selectedClient ? (
              <ClientDetailTabs
                key={selectedClient.id}
                client={selectedClient}
                dashboard={dashboard}
                planStatus={planStatus}
                engagement={engagement}
                nutritionTemplates={clientNutritionTemplates}
                exerciseTemplates={exerciseTemplates}
                saving={saving}
                sendingEmail={sendingEmail}
                sendingSms={sendingSms}
                clientWaterGoalDraft={clientWaterGoalDraft}
                onClientWaterGoalDraftChange={setClientWaterGoalDraft}
                onSaveHydrationGoal={() => void saveClientWaterGoal()}
                onSendEmail={sendResultsEmail}
                onSendText={sendResultsSms}
                onSavingChange={setSaving}
                onError={setError}
                onRefresh={refreshClientData}
                onRefreshPlanStatus={refreshPlanStatus}
                selectedSnapshotId={selectedSnapshotId}
                onSelectSnapshotId={setSelectedSnapshotId}
                snapshots={snapshots}
              />
            ) : (
              <Card>
                <p className="text-sm text-app-text-muted">Select a client from the roster to view their progress.</p>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {selectedClient ? (
              <SessionNotesPanel
                key={selectedClient.id}
                clientId={selectedClient.id}
                clientName={clientName(selectedClient)}
                programId={dashboard?.program?.id ?? null}
                onScheduleSession={() => setScheduleOpen(true)}
                onSendResults={sendResultsEmail}
                onSessionSaved={refreshClientData}
              />
            ) : (
              <Card>
                <h2 className="text-lg font-bold">Session notes</h2>
                <p className="mt-1 text-sm text-app-text-muted">Select a client to start a session.</p>
              </Card>
            )}

            {selectedClient && dashboard?.program?.id ? (
              <CoachSnapshotPreview
                programId={dashboard.program.id}
                snapshots={snapshots}
                selectedId={selectedSnapshotId}
                onSelect={setSelectedSnapshotId}
                onSnapshotUpdated={handleSnapshotUpdated}
              />
            ) : null}

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
          </div>
        </div>
      )}

      <CoachSettingsDrawer
        open={settingsOpen}
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
        onClose={() => setSettingsOpen(false)}
      />

      <ClientGroupsDrawer
        open={groupsOpen}
        clients={clients}
        groups={clientGroups}
        onClose={() => setGroupsOpen(false)}
        onGroupsChange={loadGroups}
      />

      <ScheduleCheckInDrawer
        open={scheduleOpen}
        clients={clients}
        initialDate={todayKey()}
        initialUserId={selectedClient?.id ?? ''}
        onClose={() => setScheduleOpen(false)}
        onSaved={loadClients}
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
