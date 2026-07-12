import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../services/api';
import type {
  FeedbackAssignee,
  FeedbackDetail,
  FeedbackSeverity,
  FeedbackStatus
} from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

const STATUSES: FeedbackStatus[] = ['NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'CANNOT_REPRODUCE'];
const SEVERITIES: FeedbackSeverity[] = ['BLOCKING', 'HIGH', 'MEDIUM', 'LOW'];

function fieldClass() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40';
}

function humanDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function FeedbackDetailDrawer({
  reportId,
  assignees,
  onClose,
  onChanged
}: {
  reportId: string | null;
  assignees: FeedbackAssignee[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [report, setReport] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [resolution, setResolution] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [notifyReason, setNotifyReason] = useState<'need_info' | 'resolved'>('need_info');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyStatus, setNotifyStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      setLoading(false);
      setError('');
      setNoteBody('');
      setResolution('');
      setExternalRef('');
      setNotifyMessage('');
      setNotifyStatus('');
      return;
    }
    setReport(null);
    setNoteBody('');
    setNotifyMessage('');
    setNotifyStatus('');
    setLoading(true);
    setError('');
    api<FeedbackDetail>(`/api/admin/feedback/${reportId}`)
      .then((data) => {
        setReport(data);
        setResolution(data.resolutionNote ?? '');
        setExternalRef(data.externalRef ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report.'))
      .finally(() => setLoading(false));
  }, [reportId]);

  async function patch(body: Record<string, unknown>) {
    if (!report) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<FeedbackDetail>(`/api/admin/feedback/${report.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      setReport({ ...updated, similar: report.similar });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!report || !noteBody.trim()) return;
    setBusy(true);
    try {
      const updated = await api<FeedbackDetail>(`/api/admin/feedback/${report.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: noteBody.trim() })
      });
      setReport({ ...updated, similar: report.similar });
      setNoteBody('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add note.');
    } finally {
      setBusy(false);
    }
  }

  async function notifyTester() {
    if (!report || !notifyMessage.trim()) return;
    setBusy(true);
    setNotifyStatus('');
    setError('');
    try {
      await api(`/api/admin/feedback/${report.id}/notify`, {
        method: 'POST',
        body: JSON.stringify({ reason: notifyReason, message: notifyMessage.trim() })
      });
      setNotifyMessage('');
      setNotifyStatus('Email sent to the reporter.');
      const refreshed = await api<FeedbackDetail>(`/api/admin/feedback/${report.id}`);
      setReport({ ...refreshed, similar: report.similar });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not notify the reporter.');
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.reference}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const diag = report?.diagnostics as Record<string, unknown> | null;

  return (
    <Drawer open={Boolean(reportId)} title={report ? report.reference : 'Report'} onClose={onClose} panelClassName="max-w-xl">
      {loading && <p className="text-sm text-app-text-muted">Loading…</p>}
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {report && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{report.type.toLowerCase()}</Badge>
            {report.blocking && <Badge tone="red">blocking</Badge>}
            <Badge tone={report.status === 'RESOLVED' ? 'green' : 'slate'}>{report.status.toLowerCase()}</Badge>
            <span className="text-xs text-app-text-muted">{humanDate(report.createdAt)}</span>
          </div>

          <Section title="What they were trying to do">
            <p className="text-sm text-app-text">{report.goal || '—'}</p>
          </Section>
          <Section title="What happened / idea">
            <p className="whitespace-pre-wrap text-sm text-app-text">{report.detail || '—'}</p>
          </Section>

          <Section title="Reporter & context">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-app-text-muted">Reporter</span><br />{report.reporterName}</div>
              <div><span className="text-app-text-muted">Email</span><br />{report.reporterEmail}</div>
              <div><span className="text-app-text-muted">Account</span><br />{report.accountType}</div>
              <div><span className="text-app-text-muted">Source</span><br />{report.source === 'public_support_page' ? 'Public support page' : 'In-app feedback'}</div>
              {report.category && <div><span className="text-app-text-muted">Category</span><br />{report.category}</div>}
              <div><span className="text-app-text-muted">Screen</span><br />{report.screenLabel ?? report.route}</div>
              <div><span className="text-app-text-muted">Route</span><br />{report.route}</div>
              <div><span className="text-app-text-muted">App version</span><br />{report.appVersion ?? '—'}</div>
            </div>
          </Section>

          {/* Controls */}
          <Section title="Manage">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-app-text-muted">Status</span>
                <select className={fieldClass()} value={report.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-app-text-muted">Severity</span>
                <select className={fieldClass()} value={report.severity ?? ''} disabled={busy} onChange={(e) => patch({ severity: e.target.value || null })}>
                  <option value="">—</option>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
                </select>
              </label>
              <label className="col-span-2 block text-sm">
                <span className="mb-1 block text-app-text-muted">Assigned to</span>
                <select className={fieldClass()} value={report.assignedTo?.id ?? ''} disabled={busy} onChange={(e) => patch({ assignedToId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block text-app-text-muted">Resolution</span>
                <textarea className={`${fieldClass()} min-h-[60px]`} value={resolution} onChange={(e) => setResolution(e.target.value)} onBlur={() => resolution !== (report.resolutionNote ?? '') && patch({ resolutionNote: resolution || null })} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-app-text-muted">External ticket reference</span>
                <input className={fieldClass()} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} onBlur={() => externalRef !== (report.externalRef ?? '') && patch({ externalRef: externalRef || null })} placeholder="URL or ticket ID" />
              </label>
            </div>
          </Section>

          {report.similar.length > 0 && (
            <Section title="Likely duplicates (same screen + type)">
              <ul className="space-y-1">
                {report.similar.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-app-text-muted">{s.reference} · {s.shortDescription}</span>
                    <Button variant="secondary" disabled={busy} onClick={() => patch({ duplicateOfId: s.id })}>Mark dup</Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {report.duplicateOf && (
            <p className="text-xs text-app-text-muted">Duplicate of <span className="font-medium text-app-text">{report.duplicateOf.reference}</span></p>
          )}

          {diag && (
            <Section title="Diagnostics">
              <div className="space-y-2 rounded-xl border border-app-border p-3 text-xs text-app-text-muted">
                <p>{String(diag.browser)} · {String(diag.os)} · {String(diag.deviceType)} · tz {String(diag.timezone)}</p>
                <DiagList label="Recent navigation" items={(diag.navTrail as Array<{ pathname: string }>)?.map((n) => n.pathname)} />
                <DiagList label="Client errors" items={(diag.clientErrors as Array<{ message: string }>)?.map((e) => e.message)} />
                <DiagList label="Failed requests" items={(diag.failedRequests as Array<{ method: string; path: string; status: number }>)?.map((r) => `${r.status} ${r.method} ${r.path}`)} />
                <DiagList label="Feature flags" items={diag.featureFlags as string[]} />
              </div>
            </Section>
          )}
          {report.diagnosticsPurgedAt && <p className="text-xs text-app-text-muted">Diagnostics purged {humanDate(report.diagnosticsPurgedAt)}.</p>}

          <Section title="Internal notes">
            <ul className="space-y-2">
              {report.notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-app-border p-2 text-sm">
                  <p className="whitespace-pre-wrap text-app-text">{n.body}</p>
                  <p className="mt-1 text-xs text-app-text-muted">{n.author ?? 'Someone'} · {humanDate(n.createdAt)}</p>
                </li>
              ))}
              {report.notes.length === 0 && <li className="text-sm text-app-text-muted">No notes yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className={fieldClass()} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add an internal note…" />
              <Button disabled={busy || !noteBody.trim()} onClick={addNote}>Add</Button>
            </div>
          </Section>

          <Section title="History">
            <ul className="space-y-1 text-xs text-app-text-muted">
              {report.events.map((e) => (
                <li key={e.id}>{humanDate(e.createdAt)} — {e.kind.replace(/_/g, ' ')}{e.actor ? ` by ${e.actor}` : ''}</li>
              ))}
            </ul>
          </Section>

          <Section title="Notify reporter">
            <div className="flex gap-2">
              <select className={fieldClass()} value={notifyReason} onChange={(e) => setNotifyReason(e.target.value as 'need_info' | 'resolved')}>
                <option value="need_info">Need more info</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <textarea className={`${fieldClass()} mt-2 min-h-[60px]`} value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} placeholder="Message to the reporter…" />
            {notifyStatus && <p className="text-xs text-brand-green">{notifyStatus}</p>}
            <Button className="mt-2" disabled={busy || !notifyMessage.trim()} onClick={notifyTester}>Send email</Button>
          </Section>

          <Button variant="secondary" className="w-full" onClick={exportJson}>
            <Download className="mr-1 inline h-4 w-4" /> Export JSON
          </Button>
        </div>
      )}
    </Drawer>
  );
}

function DiagList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-medium text-app-text">{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((item, i) => <li key={i} className="break-all">· {item}</li>)}
      </ul>
    </div>
  );
}
