import { useState } from 'react';
import { clsx } from 'clsx';
import { todayKey, tomorrowKey } from '../../services/api';
import type { CoachClient, CoachClientPlanStatus, Dashboard, ExercisePlanTemplateSummary, NutritionPlanTemplateSummary, ProgramMetricSnapshot } from '../../types';
import type { GamificationDashboard } from '../../types/gamification';
import type { CoachHydrationStats } from '../../types/hydration';
import { clientInitials, clientName, formatNextSession } from '../../utils/coachClientUtils';
import { SendResultsMenu } from './SendResultsMenu';
import { FoodPlanEditor } from './FoodPlanEditor';
import { CoachWeeklyFoodReportModal } from './CoachWeeklyFoodReportModal';
import { CoachWeeklyExerciseReportModal } from './CoachWeeklyExerciseReportModal';
import { ExercisePlanEditor } from './ExercisePlanEditor';
import { ClientMetricsPanel } from './ClientMetricsPanel';
import { ClientMeasurementsPanel } from './ClientMeasurementsPanel';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NumberInput } from '../ui/NumberInput';

type CoachEngagement = GamificationDashboard & { hydration: CoachHydrationStats };
type DetailTab = 'overview' | 'food' | 'exercise' | 'metrics' | 'measurements';

function TabButton({
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
        'border-b-2 px-1 pb-2 text-sm font-semibold transition',
        active ? 'border-app-text text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'
      )}
    >
      {label}
    </button>
  );
}

function formatPlanStatusLine(planStatus: CoachClientPlanStatus | null) {
  if (!planStatus) return null;
  if (planStatus.state === 'on_plan') {
    const parts = [
      planStatus.nutritionTemplateName ?? 'Weekly plan',
      planStatus.weekNumber != null ? `Week ${planStatus.weekNumber}` : null,
      planStatus.planDayIndex != null ? `day ${planStatus.planDayIndex}` : null,
      planStatus.calorieTarget != null ? `${planStatus.calorieTarget} kcal` : null
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (planStatus.state === 'coached_no_plan') return 'Tracking freely — no weekly plan assigned yet';
  return 'Self-directed tracking';
}

export function ClientDetailTabs({
  client,
  dashboard,
  planStatus,
  engagement,
  nutritionTemplates,
  exerciseTemplates,
  saving,
  sendingEmail,
  sendingSms,
  clientWaterGoalDraft,
  onClientWaterGoalDraftChange,
  onSaveHydrationGoal,
  onSendEmail,
  onSendText,
  onSavingChange,
  onError,
  onRefresh,
  onRefreshPlanStatus,
  selectedSnapshotId,
  onSelectSnapshotId,
  snapshots
}: {
  client: CoachClient;
  dashboard: Dashboard | null;
  planStatus: CoachClientPlanStatus | null;
  engagement: CoachEngagement | null;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  exerciseTemplates: ExercisePlanTemplateSummary[];
  saving: boolean;
  sendingEmail: boolean;
  sendingSms: boolean;
  clientWaterGoalDraft: string;
  onClientWaterGoalDraftChange: (value: string) => void;
  onSaveHydrationGoal: () => void;
  onSendEmail: () => void;
  onSendText: () => void;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  onRefreshPlanStatus: () => Promise<void>;
  selectedSnapshotId: string | null;
  onSelectSnapshotId: (id: string | null) => void;
  snapshots: ProgramMetricSnapshot[];
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  // Food defaults to tomorrow so the coach plans ahead while the client is still on today.
  const [foodPlanDate, setFoodPlanDate] = useState(() => tomorrowKey());
  const [exercisePlanDate, setExercisePlanDate] = useState(() => todayKey());
  const [weeklyFoodReportOpen, setWeeklyFoodReportOpen] = useState(false);
  const [weeklyExerciseReportOpen, setWeeklyExerciseReportOpen] = useState(false);
  const [foodManualOpen, setFoodManualOpen] = useState(false);
  const [exerciseManualOpen, setExerciseManualOpen] = useState(false);

  const pct = client.compliancePct;
  const hydrationToday = engagement?.hydration.todayActualOz ?? 0;
  const hydrationTarget = engagement?.hydration.todayTargetOz ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-app-muted text-sm font-bold">
            {clientInitials(client)}
          </span>
          <div>
            <h2 className="text-xl font-bold">{clientName(client)}</h2>
            <p className="text-sm text-app-text-muted">
              {client.activeProgram?.name ?? 'No active program'} · {formatNextSession(client.nextCheckInAt)}
            </p>
            {formatPlanStatusLine(planStatus) ? (
              <p className="mt-1 text-sm text-app-text">{formatPlanStatusLine(planStatus)}</p>
            ) : null}
            {planStatus?.exerciseTemplateName ? (
              <p className="text-sm text-app-text-muted">Exercise: {planStatus.exerciseTemplateName}</p>
            ) : null}
          </div>
        </div>
        <SendResultsMenu
          disabled={saving}
          sendingEmail={sendingEmail}
          sendingSms={sendingSms}
          onSendEmail={onSendEmail}
          onSendText={onSendText}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-app-muted p-3">
          <p className="text-xs uppercase text-app-text-muted">Weight</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {dashboard?.summary ? `${Math.round(dashboard.summary.currentWeight)} lbs` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-app-muted p-3">
          <p className="text-xs uppercase text-app-text-muted">Cals left</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {dashboard?.summary ? Math.round(dashboard.summary.caloriesRemaining) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-app-muted p-3">
          <p className="text-xs uppercase text-app-text-muted">Compliance</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{pct != null ? `${pct}%` : '—'}</p>
        </div>
        <div className="rounded-xl bg-app-muted p-3">
          <p className="text-xs uppercase text-app-text-muted">Hydration</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {hydrationToday}/{hydrationTarget} oz
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-app-border">
        <div className="flex gap-4">
          <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <TabButton label="Food" active={activeTab === 'food'} onClick={() => setActiveTab('food')} />
          <TabButton label="Exercise" active={activeTab === 'exercise'} onClick={() => setActiveTab('exercise')} />
          <TabButton label="Metrics" active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} />
          <TabButton label="Measurements" active={activeTab === 'measurements'} onClick={() => setActiveTab('measurements')} />
        </div>
        {(activeTab === 'food' || activeTab === 'exercise') && (
          <div className="flex items-end gap-2 pb-2">
            <label className="text-sm">
              <span className="mb-1 block text-app-text-muted">Plan date</span>
              <input
                type="date"
                className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5"
                value={activeTab === 'food' ? foodPlanDate : exercisePlanDate}
                onChange={(event) => {
                  const next = event.target.value;
                  if (activeTab === 'food') setFoodPlanDate(next);
                  else setExercisePlanDate(next);
                }}
              />
            </label>
            {activeTab === 'food' && (
              <>
                <Button type="button" variant="secondary" onClick={() => setWeeklyFoodReportOpen(true)}>
                  Week analysis
                </Button>
                <Button type="button" onClick={() => setFoodManualOpen(true)}>
                  Edit
                </Button>
              </>
            )}
            {activeTab === 'exercise' && (
              <>
                <Button type="button" variant="secondary" onClick={() => setWeeklyExerciseReportOpen(true)}>
                  Week analysis
                </Button>
                <Button type="button" onClick={() => setExerciseManualOpen(true)}>
                  Edit
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <p className="text-sm text-app-text-muted">
              {client.textPhone
                ? `Text will go to ${client.textPhone}.`
                : 'No phone on file yet — add one in account details or when sending results.'}
            </p>
            {dashboard?.summary ? (
              <>
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
                        {hydrationToday}/{hydrationTarget} oz
                      </p>
                    </div>
                    <div>
                      <p className="text-app-text-muted">30-day hit rate</p>
                      <p className="text-lg font-bold tabular-nums">{engagement?.hydration.last30DayHitPercent ?? 0}%</p>
                    </div>
                    <div>
                      <p className="text-app-text-muted">Streak</p>
                      <p className="text-lg font-bold tabular-nums">{engagement?.hydration.currentStreak ?? 0} days</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-2">
                    <label className="text-sm text-app-text-muted">
                      Daily goal (oz)
                      <NumberInput
                        min={1}
                        max={512}
                        value={clientWaterGoalDraft}
                        onChange={onClientWaterGoalDraftChange}
                        className="mt-1 block w-28 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text"
                      />
                    </label>
                    <Button disabled={saving} onClick={onSaveHydrationGoal}>
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
              </>
            ) : (
              <p className="text-sm text-app-text-muted">No dashboard data available for this user yet.</p>
            )}
          </div>
        )}

        {activeTab === 'food' && (
          <FoodPlanEditor
            clientId={client.id}
            planDate={foodPlanDate}
            nutritionTemplates={nutritionTemplates}
            planStatus={planStatus}
            saving={saving}
            manualOpen={foodManualOpen}
            onManualOpenChange={setFoodManualOpen}
            onSavingChange={onSavingChange}
            onError={onError}
            onRefresh={onRefresh}
            onRefreshPlanStatus={onRefreshPlanStatus}
          />
        )}

        {activeTab === 'exercise' && (
          <ExercisePlanEditor
            clientId={client.id}
            planDate={exercisePlanDate}
            exerciseTemplates={exerciseTemplates}
            saving={saving}
            manualOpen={exerciseManualOpen}
            onManualOpenChange={setExerciseManualOpen}
            onSavingChange={onSavingChange}
            onError={onError}
            onRefresh={onRefresh}
          />
        )}

        {activeTab === 'metrics' && (
          <ClientMetricsPanel
            program={dashboard?.program ?? null}
            snapshots={snapshots}
            selectedSnapshotId={selectedSnapshotId}
            onSelectSnapshotId={onSelectSnapshotId}
            onRefresh={onRefresh}
          />
        )}

        {activeTab === 'measurements' && (
          <ClientMeasurementsPanel program={dashboard?.program ?? null} userId={client.id} />
        )}
      </div>

      <CoachWeeklyFoodReportModal
        open={weeklyFoodReportOpen}
        clientId={client.id}
        clientName={clientName(client)}
        anchorDate={foodPlanDate}
        onClose={() => setWeeklyFoodReportOpen(false)}
      />

      <CoachWeeklyExerciseReportModal
        open={weeklyExerciseReportOpen}
        clientId={client.id}
        clientName={clientName(client)}
        anchorDate={exercisePlanDate}
        onClose={() => setWeeklyExerciseReportOpen(false)}
      />
    </Card>
  );
}
