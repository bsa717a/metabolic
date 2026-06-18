import { Link } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import type { GamificationDashboard } from '../../types/gamification';

type LevelUpPanelProps = {
  level: NonNullable<GamificationDashboard['currentLevel']>;
  variant?: 'drawer' | 'page';
  onClose?: () => void;
};

export function LevelUpPanel({ level, variant = 'page', onClose }: LevelUpPanelProps) {
  const compact = variant === 'drawer';
  const tasksDone = level.tasks.filter((task) => task.complete).length;

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {compact && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-app-text">Level Up</p>
          <div className="flex items-center gap-3">
            <Link
              to="/level-up"
              onClick={onClose}
              className="text-xs font-medium text-brand-green transition hover:text-brand-green/80"
            >
              Full page
            </Link>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-app-text-muted transition hover:text-app-text"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <ProgressRing percent={level.progressPercent} size={compact ? 56 : 72} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">
            Level {level.number}
          </p>
          {!compact && (
            <h2 className="mt-1 text-xl font-bold text-brand-navy dark:text-brand-off-white">{level.name}</h2>
          )}
          <p className={`text-app-text-muted ${compact ? 'mt-1 text-xs' : 'mt-2 text-sm'}`}>
            {tasksDone} of {level.tasks.length} tasks complete
          </p>
          {!compact && <p className="mt-2 text-sm text-app-text-muted">{level.description}</p>}
        </div>
      </div>

      <ul className="space-y-2">
        {level.tasks.map((task) => (
          <li key={task.key} className="flex items-start gap-2 text-sm">
            {task.complete ? (
              <Check size={18} className="shrink-0 text-brand-green" />
            ) : (
              <Circle size={18} className="shrink-0 text-app-text-muted" />
            )}
            <span className={task.complete ? 'text-app-text-muted line-through' : ''}>{task.label}</span>
          </li>
        ))}
      </ul>

      {level.nextUnlock && (
        <p className="text-xs text-app-text-muted">
          Next unlock: <span className="font-medium text-app-text">{level.nextUnlock}</span>
        </p>
      )}

      {!compact && (
        <Link to={level.ctaPath} className="inline-block">
          <span className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
            {level.ctaLabel}
          </span>
        </Link>
      )}

      {compact && (
        <Link
          to={level.ctaPath}
          onClick={onClose}
          className="block rounded-xl bg-brand px-4 py-2 text-center text-sm font-semibold text-brand-foreground transition hover:opacity-90"
        >
          {level.ctaLabel}
        </Link>
      )}
    </div>
  );
}
