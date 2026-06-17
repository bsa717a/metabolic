import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { ProgramMetric } from '../../types';
import { Card } from '../ui/Card';

function Ring({
  label,
  value,
  centerPercent,
  ringFillPercent,
  color
}: {
  label: string;
  value: number;
  centerPercent: number;
  ringFillPercent: number;
  color: string;
}) {
  const fill = Math.min(Math.max(ringFillPercent, 0), 100);
  const data = [{ value: fill }, { value: Math.max(100 - fill, 0) }];
  return (
    <div className="text-center">
      <div className="relative mx-auto h-32 w-32">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} innerRadius={42} outerRadius={58} dataKey="value" startAngle={90} endAngle={-270}>
              <Cell fill={color} />
              <Cell fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className="text-xl font-bold">{centerPercent.toFixed(1)}%</p>
            <p className="text-xs text-slate-500">{value.toFixed(1)} lbs</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold">{label}</p>
    </div>
  );
}

export function ProgramDonutSummary({
  metrics,
  currentLabel = 'Current'
}: {
  metrics: ProgramMetric[];
  currentLabel?: string;
}) {
  const weight = metrics.find((metric) => metric.metricType === 'WEIGHT');
  const bodyFat = metrics.find((metric) => metric.metricType === 'BODY_FAT');
  const startWeight = Number(weight?.startValue ?? 0);
  const currentWeight = Number(weight?.currentValue ?? 0);
  const goalWeight = Number(weight?.goalValue ?? 0);
  const startBodyFat = Number(bodyFat?.startValue ?? 0);
  const currentBodyFat = Number(bodyFat?.currentValue ?? 0);
  const goalBodyFat = Number(bodyFat?.goalValue ?? 0);

  return (
    <Card>
      <h2 className="mb-5 text-lg font-bold">Session Snapshot</h2>
      <div className="grid gap-5 sm:grid-cols-3">
        <Ring label="Start of Program" value={startWeight} centerPercent={startBodyFat} ringFillPercent={startBodyFat} color="#eab308" />
        <Ring label={currentLabel} value={currentWeight} centerPercent={currentBodyFat} ringFillPercent={currentBodyFat} color="#3b82f6" />
        <Ring label="Goal" value={goalWeight} centerPercent={goalBodyFat} ringFillPercent={goalBodyFat} color="#ef4444" />
      </div>
    </Card>
  );
}
