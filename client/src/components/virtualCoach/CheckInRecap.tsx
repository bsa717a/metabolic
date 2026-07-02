import { CalendarDays, Sparkles } from 'lucide-react';
import type { PlanAdvance, VirtualCoachCheckInKind, VirtualCoachCheckInRecap } from '../../types';
import { Card } from '../ui/Card';

function formatDateLabel(dateKey?: string | null) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function RecapRow({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">{label}</p>
      <p className="text-sm leading-relaxed text-app-text">{value}</p>
    </div>
  );
}

export function CheckInRecap({
  recap,
  coachName,
  planAdvance,
  kind = 'WEEKLY'
}: {
  recap: VirtualCoachCheckInRecap;
  coachName: string;
  planAdvance?: PlanAdvance | null;
  kind?: VirtualCoachCheckInKind;
}) {
  const nextLabel = formatDateLabel(recap.nextCheckInDate);
  const planStartLabel = formatDateLabel(planAdvance?.effectiveDate);
  const kickoff = kind === 'KICKOFF';
  const labels = kickoff
    ? { win: 'Your goal', pattern: 'Your why', focus: "First week's focus" }
    : { win: 'Win', pattern: 'Pattern', focus: 'Focus' };

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand-green">
          {kickoff ? 'Your kickoff recap' : 'Your check-in recap'}
        </p>
        <p className="mt-1 text-sm text-app-text-muted">
          {kickoff
            ? `Where you and ${coachName} are starting from.`
            : `A few notes from ${coachName} to carry into the week.`}
        </p>
      </div>

      <div className="grid gap-4">
        <RecapRow label={labels.win} value={recap.win} />
        <RecapRow label={labels.pattern} value={recap.pattern} />
        <RecapRow label={labels.focus} value={recap.focus} />
        <RecapRow label="Support action" value={recap.supportAction} />
      </div>

      {planAdvance && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-green/10 px-4 py-3 text-sm text-app-text ring-1 ring-brand-green/20">
          <Sparkles size={16} className="shrink-0 text-brand-green" aria-hidden />
          <span>
            {planAdvance.advanced === false ? (
              <>
                You're all set — your <span className="font-semibold">Week {planAdvance.weekNumber} plan</span> continues.
              </>
            ) : (
              <>
                Your <span className="font-semibold">Week {planAdvance.weekNumber} plan</span> starts
                {planStartLabel ? ` ${planStartLabel}` : ' tomorrow'}
                {planAdvance.templateChanged && planAdvance.nutritionTemplateName
                  ? ` — updated to ${planAdvance.nutritionTemplateName} based on your latest numbers`
                  : ''}
                .
              </>
            )}
          </span>
        </div>
      )}

      {nextLabel && (
        <div className="flex items-center gap-2 rounded-xl bg-app-muted/60 px-4 py-3 text-sm text-app-text">
          <CalendarDays size={16} className="shrink-0 text-brand-green" aria-hidden />
          <span>
            Next check-in: <span className="font-semibold">{nextLabel}</span>
          </span>
        </div>
      )}
    </Card>
  );
}
