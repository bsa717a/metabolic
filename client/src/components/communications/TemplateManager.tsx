import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import MessageEmailEditor, { type MessageEmailEditorHandle } from './MessageEmailEditor';
import { createTemplate, deleteTemplate, fetchTemplates, updateTemplate, type TemplateRecord } from '../../services/communicationsApi';
import { COMMUNICATION_CATEGORY_META } from '../../lib/communications/categories';
import { isCommunicationBodyEmpty, sanitizeCommunicationHtml } from '../../lib/communications/htmlUtils';

const CATEGORY_OPTIONS = Object.entries(COMMUNICATION_CATEGORY_META).map(([value, meta]) => ({
  value,
  label: meta.label
}));

const fieldClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

export default function TemplateManager() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [design, setDesign] = useState<unknown>(null);
  const [legacyHtml, setLegacyHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editorRef = useRef<MessageEmailEditorHandle>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await fetchTemplates());
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setName('');
    setSubject('');
    setCategory('');
    setDesign(null);
    setLegacyHtml(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (template: TemplateRecord) => {
    setEditing(template);
    setName(template.name);
    setSubject(template.subject || '');
    setCategory(template.category);
    setDesign(template.bodyDesign ?? null);
    setLegacyHtml(template.bodyDesign ? null : template.body);
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!category) {
      setError('Category is required');
      return;
    }
    setSaving(true);
    try {
      let body = sanitizeCommunicationHtml(legacyHtml || '');
      let bodyDesign: unknown = design;
      if (editorRef.current) {
        try {
          const exported = await editorRef.current.exportHtml();
          const exportedBody = sanitizeCommunicationHtml(exported.html);
          if (!isCommunicationBodyEmpty(exportedBody)) {
            body = exportedBody;
            bodyDesign = exported.design;
          }
        } catch {
          /* editor not ready */
        }
      }
      if (isCommunicationBodyEmpty(body)) {
        setError('Template body is required');
        setSaving(false);
        return;
      }

      const payload = {
        name: name.trim(),
        subject: subject || null,
        body,
        bodyDesign,
        channel: 'email',
        category
      };
      if (editing) {
        await updateTemplate(editing.id, payload);
      } else {
        await createTemplate(payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: TemplateRecord) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await deleteTemplate(template.id);
      await load();
    } catch {
      /* ignore */
    }
  };

  if (showForm) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{editing ? 'Edit template' : 'New template'}</h3>
          <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
            Cancel
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Template name <span className="text-red-500">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldClasses} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className={fieldClasses} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Category <span className="text-red-500">*</span>
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClasses}>
                <option value="">Select a category…</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Template body</label>
            <MessageEmailEditor key={editing?.id || 'new-template'} ref={editorRef} design={design} legacyHtml={legacyHtml} />
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save template
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Templates</h3>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : templates.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No templates yet. Create one to reuse across messages.</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {COMMUNICATION_CATEGORY_META[t.category]?.label || t.category}
                  {t.subject ? ` · ${t.subject}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  aria-label={`Edit ${t.name}`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(t)}
                  aria-label={`Delete ${t.name}`}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
