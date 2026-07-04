import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlanPeriodInfo } from '../../types';

function formatPlanDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PlanPeriodBanner({ planPeriod }: { planPeriod: PlanPeriodInfo }) {
  const [expanded, setExpanded] = useState(false);

  const title = planPeriod.weekNumber != null ? `Week ${planPeriod.weekNumber} plan` : 'Your plan';

  const details: string[] = [];
  if (planPeriod.calorieTarget != null) {
    details.push(`${planPeriod.calorieTarget.toLocaleString()} kcal/day`);
  }
  if (planPeriod.weekNumber != null && planPeriod.effectiveDate) {
    details.push(
      `${formatPlanDate(planPeriod.effectiveDate)} – ${planPeriod.endDate ? formatPlanDate(planPeriod.endDate) : 'ongoing'}`
    );
  } else {
    details.push('Week 1 starts at your first check-in');
  }

  return (
    <div className="rounded-2xl border border-brand-green/30 bg-brand-green/5 px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-x-2 overflow-hidden">
          <span className="shrink-0 font-bold text-app-text">{title}</span>
          <span className="truncate text-sm text-app-text-muted">{details.join(' · ')}</span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-app-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {expanded && (
        <p className="mt-2 text-xs text-app-text-muted">
          A new week starts when you complete your weekly check-in — skip it and this plan continues.
        </p>
      )}
    </div>
  );
}
