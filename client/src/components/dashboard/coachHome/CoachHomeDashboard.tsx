import { useEffect, useState } from 'react';
import { Droplets, UtensilsCrossed } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppUser, Dashboard } from '../../../types';
import type { HydrationSummary } from '../../../types/hydration';
import { api, todayDateParam } from '../../../services/api';
import { countMealProgress } from '../../virtualCoach/coachChatGreeting';
import { openHydrationDrawer } from '../../hydration/hydrationEvents';
import { CoachHomeHero } from './CoachHomeHero';
import { HabitCard } from './HabitCard';
import { CoachHomeMissions } from './CoachHomeMissions';

export function CoachHomeDashboard({
  user,
  data
}: {
  user?: AppUser | null;
  data: Dashboard;
}) {
  const navigate = useNavigate();
  const [hydration, setHydration] = useState<HydrationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<HydrationSummary>(`/api/hydration?${todayDateParam()}`)
      .then((summary) => {
        if (!cancelled) setHydration(summary);
      })
      .catch(() => {
        if (!cancelled) setHydration(null);
      });
    function refresh() {
      void api<HydrationSummary>(`/api/hydration?${todayDateParam()}`)
        .then(setHydration)
        .catch(() => undefined);
    }
    window.addEventListener('hydration-updated', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('hydration-updated', refresh);
    };
  }, []);

  const meals = data.meals ?? [];
  const { logged, planned } = countMealProgress(meals);
  const actualOz = hydration?.actualOz ?? 0;
  const goalOz = hydration?.goalOz ?? hydration?.targetOz ?? 0;
  const waterPercent = goalOz > 0 ? (actualOz / goalOz) * 100 : 0;
  const mealPercent = planned > 0 ? (logged / planned) * 100 : 0;
  const calorieTarget = Number(data.dailyLog?.calorieTarget ?? 0);
  const calorieActual = Number(data.dailyLog?.caloriesActual ?? 0);
  const caloriesLeft = Math.round(calorieTarget - calorieActual);
  const waterDone = Boolean(hydration?.goalMet || (goalOz > 0 && actualOz >= goalOz));

  return (
    <div className="space-y-5">
      <CoachHomeHero user={user} meals={meals} />

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-app-text">Today&apos;s Habits</h2>
            <p className="text-xs text-app-text-muted">Stay consistent. See results.</p>
          </div>
          {calorieTarget > 0 ? (
            <p className="shrink-0 text-xs font-semibold tabular-nums text-app-text">
              {caloriesLeft} kcal left
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <HabitCard
            label="Water"
            value={`${Math.round(actualOz)} oz Water`}
            detail={goalOz > 0 ? `Goal ${Math.round(goalOz)} oz` : 'Set a water goal'}
            percent={waterPercent}
            color="#38bdf8"
            icon={Droplets}
            onClick={() => openHydrationDrawer()}
          />
          <HabitCard
            label="Meals"
            value={planned > 0 ? `${logged} of ${planned} Meals` : 'No meals yet'}
            detail={planned > 0 ? `${planned} Meals` : 'Open nutrition'}
            percent={mealPercent}
            color="#22c55e"
            icon={UtensilsCrossed}
            onClick={() => navigate('/nutrition')}
          />
        </div>
      </section>

      <CoachHomeMissions waterDone={waterDone} meals={meals} exercises={data.exercises ?? []} />
    </div>
  );
}
