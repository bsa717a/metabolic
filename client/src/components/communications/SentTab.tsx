import { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fetchSentById, fetchSentHistory, type DraftRecord } from '../../services/communicationsApi';
import { COMMUNICATION_CATEGORY_META } from '../../lib/communications/categories';

const statusBadge = (status: string): string => {
  switch (status) {
    case 'sent':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    case 'partial':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
  }
};

const formatDate = (value: string | null | undefined): string => (value ? new Date(value).toLocaleString() : '—');

export default function SentTab() {
  const [sent, setSent] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DraftRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSentHistory()
      .then((list) => active && setSent(list))
      .catch(() => active && setSent([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await fetchSentById(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (detail) {
    const recipients = detail.recipients || [];
    const counts = recipients.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return (
      <div>
        <button type="button" onClick={() => setDetail(null)} className="mb-4 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
          ← Back to sent history
        </button>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detail.subject || '(no subject)'}</h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {COMMUNICATION_CATEGORY_META[detail.category]?.label || detail.category} · Sent {formatDate(detail.sentAt)}
        </p>

        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          {['sent', 'failed', 'skipped'].map((s) => (
            <span key={s} className="rounded-lg bg-slate-100 px-3 py-1 dark:bg-slate-800">
              {counts[s] || 0} {s}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Recipient</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Email</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{r.displayName || '—'}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.email || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{r.errorMessage || r.skipReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (sent.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nothing sent yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
      {sent.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => void openDetail(item.id)}
            disabled={detailLoading}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.subject || '(no subject)'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {COMMUNICATION_CATEGORY_META[item.category]?.label || item.category} · Sent {formatDate(item.sentAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(item.status)}`}>{item.status}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
