import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { Program } from '../../types';
import { Card } from '../ui/Card';

function MiniRing({
  label,
  weight,
  bodyFatPercent,
  color
}: {
  label: string;
  weight: number;
  bodyFatPercent: number;
  color: string;
}) {
  const fill = Math.min(Math.max(bodyFatPercent, 0), 100);
  const data = [{ value: fill }, { value: Math.max(100 - fill, 0) }];
  return (
    <div className="text-center">
      <div className="relative mx-auto h-20 w-20">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} innerRadius={26} outerRadius={36} dataKey="value" startAngle={90} endAngle={-270}>
              <Cell fill={color} />
              <Cell fill="var(--app-progress-track)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className="text-sm font-bold text-app-text">{bodyFatPercent.toFixed(1)}%</p>
            <p className="text-[10px] text-app-text-muted">{weight.toFixed(1)} lb</p>
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs font-semibold text-app-text">{label}</p>
    </div>
  );
}

export function MiniBlueprint({ program }: { program: Program | null }) {
  const weight = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const bodyFat = program?.metrics.find((metric) => metric.metricType === 'BODY_FAT');

  return (
    <Link
      to="/program"
      className="block rounded-2xl transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      aria-label="View Metabolic Blueprint"
    >
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-brand-navy dark:text-brand-off-white">Metabolic Blueprint</h2>
        {weight ? (
          <div className="grid grid-cols-3 gap-2">
            <MiniRing
              label="Start"
              weight={Number(weight.startValue)}
              bodyFatPercent={Number(bodyFat?.startValue ?? 0)}
              color="#eab308"
            />
            <MiniRing
              label="Current"
              weight={Number(weight.currentValue)}
              bodyFatPercent={Number(bodyFat?.currentValue ?? 0)}
              color="#3b82f6"
            />
            <MiniRing
              label="Goal"
              weight={Number(weight.goalValue)}
              bodyFatPercent={Number(bodyFat?.goalValue ?? 0)}
              color="#ef4444"
            />
          </div>
        ) : (
          <p className="text-sm text-app-text-muted">Set up your blueprint to see your metrics.</p>
        )}
      </Card>
    </Link>
  );
}
