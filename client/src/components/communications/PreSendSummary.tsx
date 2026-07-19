import { Loader2, Send } from 'lucide-react';
import type { EligibilitySummary } from '../../lib/communications/types';

interface PreSendSummaryProps {
  summary: EligibilitySummary | null;
  loading: boolean;
  sending: boolean;
  onSend: () => void;
}

export default function PreSendSummary({ summary, loading, sending, onSend }: PreSendSummaryProps) {
  if (!summary && !loading) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Pre-send summary</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating eligibility…
        </div>
      ) : null}

      {summary ? (
        <div className="mb-3 space-y-1 text-sm">
          <p className="text-slate-700 dark:text-slate-200">{summary.selected} recipient(s) selected</p>
          <p className="text-emerald-600 dark:text-emerald-400">{summary.eligible} eligible</p>
          {summary.unsubscribed > 0 ? <p className="text-amber-600 dark:text-amber-400">{summary.unsubscribed} unsubscribed</p> : null}
          {summary.missingEmail > 0 ? <p className="text-slate-500 dark:text-slate-400">{summary.missingEmail} missing email</p> : null}
        </div>
      ) : null}

      {summary && summary.eligible > 0 ? (
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending…' : 'Send to eligible recipients only'}
        </button>
      ) : null}

      {summary && summary.eligible === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          No eligible recipients. Unsubscribed or missing-email recipients are skipped.
        </p>
      ) : null}
    </div>
  );
}
