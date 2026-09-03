import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Circle } from 'lucide-react';
import { api } from '../services/api';
import type { JourneyLevel } from '../types/gamification';
import type { GuidedJourneyState } from '../types/guidedJourney';
import { Card } from '../components/ui/Card';
import { ProgressRing } from '../components/gamification/ProgressRing';

const statusIcon = {
  COMPLETED: Check,
  ACTIVE: Circle,
  PREVIEW: Circle,
  LOCKED: Lock
} as const;

export function LevelPathPage() {
  const [levels, setLevels] = useState<JourneyLevel[]>([]);
  const [journeyEnabled, setJourneyEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api<GuidedJourneyState>('/api/guided-journey')
      .then((state) => setJourneyEnabled(state.enabled))
      .catch(() => setJourneyEnabled(false));
  }, []);

  useEffect(() => {
    if (journeyEnabled !== true) return;
    api<JourneyLevel[]>('/api/gamification/journey').then(setLevels);
  }, [journeyEnabled]);

  if (journeyEnabled === null) {
    return <p className="text-app-text-muted">Loading…</p>;
  }

  // Legacy level ladder is only available while Guided Journey is enabled.
  if (!journeyEnabled) {
    return <Navigate to="/level-up/badges" replace />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        to="/level-up"
        className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
      >
        <ArrowLeft size={16} /> Level Up
      </Link>
      <h1 className="text-3xl font-bold">Level path</h1>
      <p className="text-sm text-app-text-muted">
        Each level introduces one new behavior. Complete it to unlock what comes next.
      </p>

      <ol className="relative space-y-0 border-l-2 border-app-border ml-4 pl-8 pb-4">
        {levels.map((level) => {
          const Icon = statusIcon[level.status] ?? Lock;
          const isActive = level.status === 'ACTIVE';
          const isDone = level.status === 'COMPLETED';

          return (
            <li key={level.id} className="relative pb-10 last:pb-0">
              <span
                className={`absolute -left-[2.55rem] grid h-8 w-8 place-items-center rounded-full border-2 bg-app-surface ${
                  isDone
                    ? 'border-brand-green text-brand-green'
                    : isActive
                      ? 'border-brand-green text-brand-green'
                      : 'border-app-border text-app-text-muted'
                }`}
              >
                <Icon size={16} />
              </span>
              <Card className={isActive ? 'ring-2 ring-brand-green/30' : ''}>
                <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                  Level {level.number}
                  {level.completedAt && (
                    <span className="ml-2 normal-case">
                      · Completed {new Date(level.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
                <h2 className="mt-1 text-lg font-bold">{level.name}</h2>
                {isActive ? (
                  <>
                    <p className="mt-2 text-sm text-app-text-muted">{level.purpose}</p>
                    <div className="mt-4 flex items-center gap-4">
                      <ProgressRing percent={level.progressPercent} size={48} />
                      <p className="text-sm text-app-text-muted">{level.progressPercent}% complete</p>
                    </div>
                    {level.unlocks[0] && (
                      <p className="mt-3 text-xs text-app-text-muted">Unlocks: {level.unlocks.join(', ')}</p>
                    )}
                  </>
                ) : level.previewOnly ? (
                  <p className="mt-2 text-sm text-app-text-muted">{level.description}</p>
                ) : isDone ? (
                  <p className="mt-2 text-sm text-app-text-muted">{level.description}</p>
                ) : (
                  <p className="mt-2 text-sm text-app-text-muted italic">Complete the previous level to unlock</p>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
