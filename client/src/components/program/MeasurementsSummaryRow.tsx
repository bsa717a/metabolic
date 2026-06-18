import { Camera } from 'lucide-react';
import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import {
  formatMeasurementDisplay,
  getMeasurementValues
} from '../../utils/measurementUtils';
import { parseDateKey } from '../../services/api';
import { Card } from '../ui/Card';

function formatSessionDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function MeasurementsSummaryRow({
  sessionDate,
  snapshot,
  photoSet,
  compact = false,
  onClick
}: {
  sessionDate: string;
  snapshot: ProgramMetricSnapshot | null;
  photoSet: ProgressPhotoSet | null;
  compact?: boolean;
  onClick: () => void;
}) {
  const values = getMeasurementValues(snapshot);
  const hasPhotos = Boolean(photoSet?.frontUrl || photoSet?.sideUrl || photoSet?.backUrl);

  return (
    <Card className={compact ? 'p-4' : undefined}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
        <div>
          <h2 className={`mb-1 font-bold ${compact ? 'text-base' : 'text-lg'}`}>Measurements</h2>
          <p className={compact ? 'text-xs text-slate-500 dark:text-app-text-muted' : 'text-sm text-slate-500 dark:text-app-text-muted'}>
            Tap the row to log waist, hips, chest, and progress photos for this session.
          </p>
        </div>
        {hasPhotos && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-green">
            <Camera className="h-3.5 w-3.5" />
            Photos saved
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:bg-slate-50 dark:border-app-border dark:hover:bg-app-muted"
      >
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${compact ? 'text-sm' : 'text-base'}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-app-text-muted">Date</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900 dark:text-app-text">{formatSessionDate(sessionDate)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-app-text-muted">Waist</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900 dark:text-app-text">{formatMeasurementDisplay(values.waist)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-app-text-muted">Hips</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900 dark:text-app-text">{formatMeasurementDisplay(values.hips)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-app-text-muted">Chest</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-900 dark:text-app-text">{formatMeasurementDisplay(values.chest)}</p>
          </div>
        </div>
      </button>
    </Card>
  );
}
