import { clsx } from 'clsx';
import { Calendar, CalendarCheck, CalendarDays, CalendarPlus, ChevronDown, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  api,
  formatDayAbbrev,
  formatDayNumber,
  formatMonthLabel,
  formatWeekRange,
  getMonthGridDates,
  getWeekDates,
  isToday,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  todayKey
} from '../../services/api';
import type {
  ClientGroup,
  CoachCalendarEvent,
  CoachCalendarEventType,
  CoachCalendarResponse,
  CoachClient
} from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ScheduleCheckInDrawer } from './ScheduleCheckInDrawer';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import {
  readCoachCalendarActivityFilter,
  saveCoachCalendarActivityFilter
} from '../../utils/coachCalendarPreferences';

const EVENT_LABELS: Record<CoachCalendarEvent['type'], string> = {
  daily_log: 'Daily activity',
  exercise_plan: 'Exercise plan',
  metric_snapshot: 'Metrics',
  progress_snapshot: 'Snapshot',
  program_start: 'Program start',
  program_end: 'Program end',
  check_in: 'Check-in'
};

const EVENT_COLORS: Record<CoachCalendarEvent['type'], string> = {
  daily_log: 'bg-sky-500',
  exercise_plan: 'bg-amber-500',
  metric_snapshot: 'bg-violet-500',
  progress_snapshot: 'bg-emerald-500',
  program_start: 'bg-brand-navy dark:bg-brand-green',
  program_end: 'bg-slate-400',
  check_in: 'bg-rose-500'
};

const ACTIVITY_FILTER_OPTIONS: { value: CoachCalendarEventType; label: string }[] = [
  { value: 'check_in', label: 'Check-ins' },
  { value: 'daily_log', label: 'Daily tracking' },
  { value: 'exercise_plan', label: 'Exercise plans' },
  { value: 'metric_snapshot', label: 'Body metrics' },
  { value: 'progress_snapshot', label: 'Progress snapshots' },
  { value: 'program_start', label: 'Program starts' },
  { value: 'program_end', label: 'Program target ends' }
];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const filterSelectClassName =
  'h-10 rounded-xl border border-app-border bg-app-surface px-3 text-sm leading-none';

function formatSelectedDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function clientName(client: CoachClient) {
  return `${client.firstName} ${client.lastName}`;
}

function formatCheckInTime(startsAt?: string) {
  if (!startsAt) return '';
  return new Date(startsAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function activityFilterLabel(selected: CoachCalendarEventType[]) {
  if (selected.length === 0) return 'All activity';
  if (selected.length === 1) {
    return ACTIVITY_FILTER_OPTIONS.find((option) => option.value === selected[0])?.label ?? '1 activity';
  }
  return `${selected.length} activities`;
}

const iconButtonClassName =
  'inline-flex min-h-[2.5rem] min-w-[2.5rem] items-center justify-center rounded-xl px-3.5 py-2.5 transition disabled:cursor-not-allowed disabled:opacity-50';

export function CoachCalendar({
  coachUserId,
  clients,
  scheduleClients,
  clientGroups,
  groupId,
  onGroupChange,
  onManageGroups,
  onSelectClient,
  onCheckInsChanged
}: {
  coachUserId: string;
  clients: CoachClient[];
  scheduleClients: CoachClient[];
  clientGroups: ClientGroup[];
  groupId: string;
  onGroupChange: (groupId: string) => void;
  onManageGroups: () => void;
  onSelectClient: (userId: string) => void;
  onCheckInsChanged?: () => void | Promise<void>;
}) {
  const [rangeMode, setRangeMode] = useState<'week' | 'month'>('month');
  const [anchorDate, setAnchorDate] = useState(() => todayKey());
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [filterUserId, setFilterUserId] = useState('');
  const [filterActivityTypes, setFilterActivityTypes] = useState<CoachCalendarEventType[]>(() =>
    readCoachCalendarActivityFilter(coachUserId)
  );
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const activityMenuRef = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<CoachCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [editingCheckIn, setEditingCheckIn] = useState<CoachCalendarEvent | null>(null);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => clientName(a).localeCompare(clientName(b))),
    [clients]
  );

  const range = useMemo(() => {
    if (rangeMode === 'week') {
      const start = startOfWeek(anchorDate);
      return { start, end: addDays(start, 6) };
    }
    const monthStart = startOfMonth(anchorDate);
    const { dates } = getMonthGridDates(monthStart);
    return { start: dates[0], end: dates[dates.length - 1] };
  }, [anchorDate, rangeMode]);

  const periodLabel =
    rangeMode === 'week' ? formatWeekRange(startOfWeek(anchorDate)) : formatMonthLabel(startOfMonth(anchorDate));

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end });
      if (groupId) params.set('groupId', groupId);
      const data = await api<CoachCalendarResponse>(`/api/coach/calendar?${params.toString()}`);
      setEvents(data.events);
    } catch (err) {
      setEvents([]);
      setError(err instanceof Error ? err.message : 'Unable to load calendar');
    } finally {
      setLoading(false);
    }
  }, [groupId, range.end, range.start]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (!coachUserId) return;
    setFilterActivityTypes(readCoachCalendarActivityFilter(coachUserId));
  }, [coachUserId]);

  useEffect(() => {
    if (!filterUserId) return;
    if (sortedClients.some((client) => client.id === filterUserId)) return;
    setFilterUserId('');
  }, [filterUserId, sortedClients]);

  useEffect(() => {
    if (!activityMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (activityMenuRef.current?.contains(event.target as Node)) return;
      setActivityMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [activityMenuOpen]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterUserId && event.userId !== filterUserId) return false;
      if (filterActivityTypes.length > 0 && !filterActivityTypes.includes(event.type)) return false;
      return true;
    });
  }, [events, filterActivityTypes, filterUserId]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CoachCalendarEvent[]>();
    for (const event of filteredEvents) {
      const current = map.get(event.date) ?? [];
      current.push(event);
      map.set(event.date, current);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const monthStart = startOfMonth(anchorDate);
  const { dates: monthDates, month: visibleMonth } = getMonthGridDates(monthStart);
  const weekDates = getWeekDates(startOfWeek(anchorDate));
  const filtersActive = Boolean(groupId || filterUserId || filterActivityTypes.length > 0);

  function shiftAnchor(delta: number) {
    const next =
      rangeMode === 'week' ? addDays(startOfWeek(anchorDate), delta * 7) : addMonths(startOfMonth(anchorDate), delta);
    setAnchorDate(next);
    setSelectedDate(next);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setAnchorDate(date);
  }

  function setRangeModeAndSync(mode: 'week' | 'month') {
    setAnchorDate(selectedDate);
    setRangeMode(mode);
  }

  function openScheduleCheckIn(event?: CoachCalendarEvent | null) {
    setEditingCheckIn(event ?? null);
    setCheckInOpen(true);
  }

  function handleEventClick(event: CoachCalendarEvent) {
    if (event.type === 'check_in' && event.checkInId) {
      openScheduleCheckIn(event);
      return;
    }
    onSelectClient(event.userId);
  }

  function toggleActivityType(type: CoachCalendarEventType) {
    setFilterActivityTypes((current) => {
      const next = current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type];
      if (coachUserId) {
        saveCoachCalendarActivityFilter(coachUserId, next);
      }
      return next;
    });
  }

  function clearFilters() {
    onGroupChange('');
    setFilterUserId('');
    setFilterActivityTypes([]);
    if (coachUserId) {
      saveCoachCalendarActivityFilter(coachUserId, []);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Client calendar</h2>
          <p className="text-sm text-app-text-muted">
            Activity, check-ins, snapshots, and program milestones from assigned clients.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={scheduleClients.length === 0}
            onClick={() => openScheduleCheckIn(null)}
            aria-label="Schedule check-in"
            title="Schedule check-in"
            className={clsx(iconButtonClassName, 'px-3.5')}
          >
            <CalendarPlus className="h-[1.375rem] w-[1.375rem]" />
          </Button>
          <div className="inline-flex rounded-xl border border-app-border p-1">
            <button
              type="button"
              aria-label="Week view"
              title="Week view"
              className={clsx(
                iconButtonClassName,
                'min-w-0',
                rangeMode === 'week' ? 'bg-app-muted text-app-text' : 'text-app-text-muted hover:bg-app-muted hover:text-app-text'
              )}
              onClick={() => setRangeModeAndSync('week')}
            >
              <CalendarDays className="h-[1.375rem] w-[1.375rem]" />
            </button>
            <button
              type="button"
              aria-label="Month view"
              title="Month view"
              className={clsx(
                iconButtonClassName,
                'min-w-0',
                rangeMode === 'month' ? 'bg-app-muted text-app-text' : 'text-app-text-muted hover:bg-app-muted hover:text-app-text'
              )}
              onClick={() => setRangeModeAndSync('month')}
            >
              <Calendar className="h-[1.375rem] w-[1.375rem]" />
            </button>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const today = todayKey();
              setAnchorDate(today);
              setSelectedDate(today);
            }}
            aria-label="Go to today"
            title="Today"
            className={clsx(iconButtonClassName, 'px-3.5 ring-0')}
          >
            <CalendarCheck className="h-[1.375rem] w-[1.375rem]" />
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={rangeMode === 'week' ? 'Previous week' : 'Previous month'}
            className="rounded-lg border border-app-border px-2 py-1 text-sm text-app-text-muted hover:bg-app-muted"
            onClick={() => shiftAnchor(-1)}
          >
            ◀
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold text-app-text">{periodLabel}</span>
          <button
            type="button"
            aria-label={rangeMode === 'week' ? 'Next week' : 'Next month'}
            className="rounded-lg border border-app-border px-2 py-1 text-sm text-app-text-muted hover:bg-app-muted"
            onClick={() => shiftAnchor(1)}
          >
            ▶
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <select
            className={filterSelectClassName}
            value={groupId}
            aria-label="Filter by group"
            onChange={(event) => onGroupChange(event.target.value)}
          >
            <option value="">All groups</option>
            {clientGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.memberCount})
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Manage client groups"
            title="Manage client groups"
            className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl px-3.5 py-2.5 text-app-text transition hover:bg-app-muted"
            onClick={onManageGroups}
          >
            <UsersRound className="h-[1.375rem] w-[1.375rem]" />
          </button>
          <select
            className={filterSelectClassName}
            value={filterUserId}
            aria-label="Filter by client"
            onChange={(event) => setFilterUserId(event.target.value)}
          >
            <option value="">All clients</option>
            {sortedClients.map((client) => (
              <option key={client.id} value={client.id}>
                {clientName(client)}
              </option>
            ))}
          </select>
          <div ref={activityMenuRef} className="relative">
            <button
              type="button"
              aria-label="Filter by activity"
              aria-expanded={activityMenuOpen}
              aria-haspopup="listbox"
              className={clsx(
                filterSelectClassName,
                'inline-flex items-center justify-between gap-2 text-left'
              )}
              onClick={() => setActivityMenuOpen((open) => !open)}
            >
              <span className="truncate">{activityFilterLabel(filterActivityTypes)}</span>
              <ChevronDown
                className={clsx('h-4 w-4 shrink-0 text-app-text-muted transition', activityMenuOpen && 'rotate-180')}
              />
            </button>
            {activityMenuOpen && (
              <div
                role="listbox"
                aria-label="Activity types"
                aria-multiselectable="true"
                className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-xl border border-app-border bg-app-surface p-2 shadow-lg"
              >
                {ACTIVITY_FILTER_OPTIONS.map((option) => {
                  const checked = filterActivityTypes.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      role="option"
                      aria-selected={checked}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-app-text hover:bg-app-muted"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-app-border text-brand-navy focus:ring-brand-navy dark:text-brand-green dark:focus:ring-brand-green"
                        checked={checked}
                        onChange={() => toggleActivityType(option.value)}
                      />
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={clsx('h-2 w-2 shrink-0 rounded-full', EVENT_COLORS[option.value])} />
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {filtersActive && (
            <button
              type="button"
              className="text-sm font-medium text-app-text-muted transition hover:text-app-text"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {rangeMode === 'week' ? (
        <WeekDateStrip
          hideHeader
          selectedDate={selectedDate}
          onSelectDate={selectDate}
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-app-text-muted">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthDates.map((date) => {
              const dayEvents = eventsByDate.get(date) ?? [];
              const inMonth = parseDateKey(date).getUTCMonth() === visibleMonth;
              const selected = date === selectedDate;
              const today = isToday(date);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => selectDate(date)}
                  className={clsx(
                    'min-h-[4.5rem] rounded-xl border p-2 text-left transition',
                    selected
                      ? 'border-brand-navy bg-app-muted dark:border-brand-green'
                      : 'border-app-border bg-app-surface hover:bg-app-muted/60',
                    !inMonth && 'opacity-45',
                    today && !selected && 'ring-2 ring-brand-green/40 ring-offset-1'
                  )}
                >
                  <span className="text-sm font-semibold text-app-text">{formatDayNumber(date)}</span>
                  {dayEvents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span key={event.id} className={clsx('h-2 w-2 rounded-full', EVENT_COLORS[event.type])} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] font-semibold text-app-text-muted">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-app-border pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-app-text">{formatSelectedDay(selectedDate)}</h3>
          <div className="flex items-center gap-3">
            {loading && <span className="text-sm text-app-text-muted">Loading…</span>}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-navy transition hover:opacity-80 dark:text-brand-green"
              onClick={() => openScheduleCheckIn(null)}
            >
              <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
              Schedule a check-in
            </button>
          </div>
        </div>

        {selectedEvents.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            {filtersActive ? 'No activity matches these filters on this day.' : 'No client activity on this day.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-left transition hover:bg-app-muted"
                  onClick={() => handleEventClick(event)}
                >
                  <span className={clsx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', EVENT_COLORS[event.type])} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-app-text">{event.userName}</span>
                    <span className="block text-sm text-app-text">
                      {event.type === 'check_in' && event.startsAt
                        ? `${formatCheckInTime(event.startsAt)} · ${event.title}`
                        : event.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-app-text-muted">
                      {EVENT_LABELS[event.type]}
                      {event.detail ? ` · ${event.detail}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rangeMode === 'week' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {weekDates.map((date) => {
            const count = eventsByDate.get(date)?.length ?? 0;
            if (!count) return null;
            return (
              <button
                key={date}
                type="button"
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-semibold transition',
                  date === selectedDate
                    ? 'bg-brand-navy text-brand-off-white dark:bg-brand-green dark:text-brand-navy'
                    : 'bg-app-muted text-app-text'
                )}
                onClick={() => selectDate(date)}
              >
                {formatDayAbbrev(date)} {formatDayNumber(date)} · {count}
              </button>
            );
          })}
        </div>
      )}
      <ScheduleCheckInDrawer
        open={checkInOpen}
        clients={scheduleClients}
        initialDate={selectedDate}
        initialUserId={filterUserId}
        editingEvent={editingCheckIn}
        onClose={() => {
          setCheckInOpen(false);
          setEditingCheckIn(null);
        }}
        onSaved={async () => {
          await loadCalendar();
          await onCheckInsChanged?.();
        }}
      />
    </Card>
  );
}
