import type { ProgramMetric } from '../../types';
import { BLUEPRINT_JOURNEY_METRICS } from '../../utils/journeyDialUtils';
import { JourneyDial } from './JourneyDial';

export function JourneyDialsGrid({ metrics }: { metrics: ProgramMetric[] }) {
  const byType = new Map(metrics.map((metric) => [metric.metricType, metric]));

  return (
    <div className="grid grid-cols-3 gap-4">
      {BLUEPRINT_JOURNEY_METRICS.map((config) => {
        const metric = byType.get(config.type);
        if (!metric) {
          return (
            <div
              key={config.type}
              className="flex min-w-0 flex-col items-center justify-center rounded-xl bg-app-muted px-1 py-4 text-center"
            >
              <p className="text-[18px] font-semibold uppercase tracking-wide text-app-text-muted">{config.label}</p>
              <p className="mt-1 text-[10px] text-app-text-muted">—</p>
            </div>
          );
        }

        return (
          <JourneyDial
            key={config.type}
            id={config.type}
            label={config.label}
            start={Number(metric.startValue)}
            current={Number(metric.currentValue)}
            goal={Number(metric.goalValue)}
            formatValue={config.format}
            unit={metric.unit}
          />
        );
      })}
    </div>
  );
}
