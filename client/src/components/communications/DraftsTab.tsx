import { useEffect, useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { deleteDraft, fetchDrafts, type DraftRecord } from '../../services/communicationsApi';
import { COMMUNICATION_CATEGORY_META } from '../../lib/communications/categories';

interface DraftsTabProps {
  onEdit: (draft: DraftRecord) => void;
  refreshKey: number;
}

const formatDate = (value: string | null | undefined): string => (value ? new Date(value).toLocaleString() : '—');

export default function DraftsTab({ onEdit, refreshKey }: DraftsTabProps) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setDrafts(await fetchDrafts());
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleDelete = async (draft: DraftRecord) => {
    if (!window.confirm('Delete this draft?')) return;
    try {
      await deleteDraft(draft.id);
      await load();
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No drafts saved.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
      {drafts.map((draft) => (
        <li key={draft.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{draft.subject || '(no subject)'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {COMMUNICATION_CATEGORY_META[draft.category]?.label || draft.category} · Updated {formatDate(draft.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(draft)}
              aria-label="Edit draft"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(draft)}
              aria-label="Delete draft"
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
