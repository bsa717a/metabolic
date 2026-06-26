import { clsx } from 'clsx';
import { addDays, formatDayAbbrev, formatDayNumber, formatWeekRange, getWeekDates, isToday, startOfWeek } from '../../services/api';

export function WeekDateStrip({
  selectedDate,
  onSelectDate,
  endAction,
  hideHeader = false
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  endAction?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const weekStart = startOfWeek(selectedDate);
  const weekDates = getWeekDates(weekStart);

  function shiftWeek(delta: number) {
    onSelectDate(addDays(weekStart, delta * 7));
  }

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">{formatWeekRange(weekStart)}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => shiftWeek(-1)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Previous week">◀</button>
            <button type="button" onClick={() => shiftWeek(1)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50" aria-label="Next week">▶</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
        {weekDates.map((date) => {
          const selected = date === selectedDate;
          const today = isToday(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDate(date)}
              className={clsx(
                'flex min-w-[3.5rem] snap-start flex-col items-center rounded-2xl border px-3 py-2 transition',
                selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                today && !selected && 'ring-2 ring-blue-400 ring-offset-1'
              )}
            >
              <span className="text-xs font-medium opacity-80">{formatDayAbbrev(date)}</span>
              <span className="text-lg font-bold">{formatDayNumber(date)}</span>
              {today && <span className={clsx('mt-0.5 h-1.5 w-1.5 rounded-full', selected ? 'bg-white' : 'bg-blue-500')} />}
            </button>
          );
        })}
        </div>
        {endAction && <div className="shrink-0 pb-1">{endAction}</div>}
      </div>
    </div>
  );
}
