import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type {
  FeedbackAssignee,
  FeedbackListResult,
  FeedbackListRow,
  FeedbackStatus,
  FeedbackType
} from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FeedbackDetailDrawer } from './FeedbackDetailDrawer';

const STATUS_OPTIONS: Array<FeedbackStatus | ''> = ['', 'NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'CANNOT_REPRODUCE'];
const TYPE_OPTIONS: Array<FeedbackType | ''> = ['', 'BUG', 'CONFUSING', 'IDEA'];

function statusTone(status: FeedbackStatus): 'green' | 'blue' | 'slate' | 'yellow' {
  if (status === 'RESOLVED') return 'green';
  if (status === 'NEW') return 'yellow';
  if (status === 'REVIEWING' || status === 'PLANNED') return 'blue';
  return 'slate';
}

function fieldClass() {
  return 'rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40';
}

function humanDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function FeedbackAdminPanel() {
  const [result, setResult] = useState<FeedbackListResult | null>(null);
  const [assignees, setAssignees] = useState<FeedbackAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const [type, setType] = useState<FeedbackType | ''>('');
  const [blocking, setBlocking] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('pageSize', '50');
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (blocking) params.set('blocking', blocking);
      if (search.trim()) params.set('search', search.trim());
      const data = await api<FeedbackListResult>(`/api/admin/feedback?${params.toString()}`);
      setResult(data);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [status, type, blocking, search]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    api<FeedbackAssignee[]>('/api/admin/feedback/assignees').then(setAssignees).catch(() => undefined);
  }, []);

  const rows: FeedbackListRow[] = result?.reports ?? [];
  const totalPages = result?.totalPages ?? 1;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-app-text">Feedback</h2>
          <p className="mt-0.5 text-sm text-app-text-muted">{result?.total ?? 0} report{result?.total === 1 ? '' : 's'}.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select className={fieldClass()} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | '')}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s ? s.toLowerCase() : 'All statuses'}</option>)}
        </select>
        <select className={fieldClass()} value={type} onChange={(e) => setType(e.target.value as FeedbackType | '')}>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t ? t.toLowerCase() : 'All types'}</option>)}
        </select>
        <select className={fieldClass()} value={blocking} onChange={(e) => setBlocking(e.target.value as '' | 'true' | 'false')}>
          <option value="">Blocking & not</option>
          <option value="true">Blocking only</option>
          <option value="false">Non-blocking</option>
        </select>
        <input className={`${fieldClass()} min-w-[12rem] flex-1`} placeholder="Search reports…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-app-text-muted">Loading…</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-app-border text-left text-xs uppercase tracking-wide text-app-text-muted">
                <th className="py-2 pr-3">Ref</th>
                <th className="px-3 py-2">Report</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Screen</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setOpenId(row.id)}
                  className="cursor-pointer border-b border-app-border/60 hover:bg-app-muted"
                >
                  <td className="py-2 pr-3 font-medium text-app-text">{row.reference}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-app-text">{row.shortDescription}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Badge tone="blue">{row.type.toLowerCase()}</Badge>
                      {row.blocking && <Badge tone="red">blocking</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{row.status.toLowerCase()}</Badge></td>
                  <td className="px-3 py-2 text-app-text-muted">
                    {row.reporterName}
                    <span className="block text-xs">{row.accountType}</span>
                  </td>
                  <td className="px-3 py-2 text-app-text-muted">{row.screenLabel ?? row.route}</td>
                  <td className="px-3 py-2 text-app-text-muted">{row.assignedTo?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-app-text-muted">{humanDate(row.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-app-text-muted">No reports match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
          <p className="text-sm text-app-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={loading || page >= totalPages} onClick={() => void load(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <FeedbackDetailDrawer
        reportId={openId}
        assignees={assignees}
        onClose={() => setOpenId(null)}
        onChanged={() => void load(page)}
      />
    </Card>
  );
}
