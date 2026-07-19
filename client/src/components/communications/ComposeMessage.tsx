import { useEffect, useRef, useState } from 'react';
import { Eye, LayoutTemplate, Loader2, Save } from 'lucide-react';
import RecipientSelector from './RecipientSelector';
import PreSendSummary from './PreSendSummary';
import MessageEmailEditor, { type MessageEmailEditorHandle } from './MessageEmailEditor';
import AiEmailStudio from './AiEmailStudio';
import {
  CommunicationsApiError,
  createDraft,
  createTemplate,
  fetchTemplates,
  previewEligibility,
  sendCommunication,
  updateDraft,
  type CommunicationPayload,
  type DraftRecord,
  type SendResult,
  type TemplateRecord
} from '../../services/communicationsApi';
import { COMMUNICATION_CATEGORY_META } from '../../lib/communications/categories';
import { isCommunicationBodyEmpty, sanitizeCommunicationHtml } from '../../lib/communications/htmlUtils';
import type { EligibilitySummary, RecipientInput } from '../../lib/communications/types';

type EditorMode = 'ai' | 'visual';

interface ComposeForm {
  subject: string;
  body: string;
  bodyDesign: unknown;
  category: string;
  recipients: RecipientInput[];
}

interface ComposeMessageProps {
  initialData?: Partial<DraftRecord> | null;
  draftId?: string | null;
  preselectedRecipients?: RecipientInput[] | null;
  onSent?: (result: SendResult) => void;
  onDraftSaved?: (draft: DraftRecord) => void;
}

const emptyForm: ComposeForm = {
  subject: '',
  body: '',
  bodyDesign: null,
  category: '',
  recipients: []
};

const CATEGORY_OPTIONS = Object.entries(COMMUNICATION_CATEGORY_META).map(([value, meta]) => ({
  value,
  label: meta.label,
  allowsUnsubscribe: meta.allowsUnsubscribe
}));

const fieldClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const secondaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';

function initialEditorMode(initialData?: Partial<DraftRecord> | null): EditorMode {
  if (initialData?.bodyDesign) return 'visual';
  return 'ai';
}

export default function ComposeMessage({ initialData, draftId = null, preselectedRecipients = null, onSent, onDraftSaved }: ComposeMessageProps) {
  const [form, setForm] = useState<ComposeForm>(() => ({
    ...emptyForm,
    ...(initialData
      ? {
          subject: initialData.subject || '',
          body: initialData.body || '',
          bodyDesign: initialData.bodyDesign ?? null,
          category: initialData.category || '',
          recipients: (initialData.recipientsJson as RecipientInput[]) || []
        }
      : {})
  }));
  const [editorMode, setEditorMode] = useState<EditorMode>(() => initialEditorMode(initialData));
  const [summary, setSummary] = useState<EligibilitySummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateVersion, setTemplateVersion] = useState(0);
  const [switchingMode, setSwitchingMode] = useState(false);
  const editorRef = useRef<MessageEmailEditorHandle>(null);

  const reloadTemplates = async () => {
    try {
      setTemplates(await fetchTemplates());
    } catch {
      /* keep existing list */
    }
  };

  const lockedRecipients = preselectedRecipients && preselectedRecipients.length ? preselectedRecipients : null;
  const useLocked = Boolean(lockedRecipients?.length);

  useEffect(() => {
    if (useLocked && lockedRecipients) {
      setForm((prev) => ({ ...prev, recipients: lockedRecipients }));
    }
  }, [useLocked, lockedRecipients]);

  useEffect(() => {
    let active = true;
    fetchTemplates()
      .then((list) => active && setTemplates(Array.isArray(list) ? list : []))
      .catch(() => active && setTemplates([]));
    return () => {
      active = false;
    };
  }, []);

  // Invalidate stale pre-send summary when the send-relevant form fields change.
  useEffect(() => {
    setSummary(null);
  }, [form.recipients, form.category, form.subject, form.body, form.bodyDesign]);

  const handleApplyTemplate = (templateId: string) => {
    if (!templateId) {
      setSelectedTemplateId('');
      return;
    }
    const template = templates.find((t) => String(t.id) === String(templateId));
    if (!template) return;

    const hasContent = !isCommunicationBodyEmpty(form.body) || Boolean(form.subject);
    if (hasContent && !window.confirm('Replace the current subject and message with this template?')) {
      return;
    }

    setSelectedTemplateId(String(templateId));
    setForm((prev) => ({
      ...prev,
      subject: template.subject || '',
      body: template.body || '',
      bodyDesign: template.bodyDesign ?? null,
      category: template.category || prev.category
    }));
    setTemplateVersion((v) => v + 1);
    setEditorMode(template.bodyDesign ? 'visual' : 'ai');
  };

  const syncEmailFromEditor = async (): Promise<{ body: string; bodyDesign: unknown }> => {
    const storedBody = sanitizeCommunicationHtml(form.body);

    if (editorMode === 'ai') {
      return { body: storedBody, bodyDesign: null };
    }

    if (editorRef.current) {
      try {
        const { html, design } = await editorRef.current.exportHtml();
        const exportedBody = sanitizeCommunicationHtml(html);
        if (!isCommunicationBodyEmpty(exportedBody)) {
          return { body: exportedBody, bodyDesign: design };
        }
      } catch {
        /* editor not ready; fall back to stored body */
      }
    }
    return { body: storedBody, bodyDesign: form.bodyDesign };
  };

  const buildPayload = async (): Promise<CommunicationPayload> => {
    const { body, bodyDesign } = await syncEmailFromEditor();
    return {
      subject: form.subject || null,
      body,
      bodyDesign,
      channel: 'email',
      category: form.category,
      recipients: form.recipients
    };
  };

  const hasRecipients = form.recipients.length > 0;

  const handlePreview = async () => {
    setError('');
    setSuccess('');
    setPreviewLoading(true);
    try {
      const payload = await buildPayload();
      if (isCommunicationBodyEmpty(payload.body)) {
        setError('Message body is required');
        return;
      }
      setSummary(await previewEligibility(payload));
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'Failed to preview eligibility');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    setError('');
    setSuccess('');
    setSending(true);
    try {
      const result = await sendCommunication(await buildPayload(), draftId);
      setSuccess(`Sent to ${result.summary.sent} recipient(s).`);
      setSummary(null);
      onSent?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send communication');
      if (err instanceof CommunicationsApiError && err.summary) setSummary(err.summary);
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setError('');
    setSuccess('');
    setSavingDraft(true);
    try {
      const payload = await buildPayload();
      if (isCommunicationBodyEmpty(payload.body)) {
        setError('Message body is required');
        return;
      }
      const draft = draftId ? await updateDraft(draftId, payload) : await createDraft(payload);
      setSuccess('Draft saved.');
      onDraftSaved?.(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    setError('');
    setSuccess('');
    if (!form.category) {
      setError('Choose a category before saving a template.');
      return;
    }
    const defaultName = form.subject.trim() || 'Untitled template';
    const name = window.prompt('Template name', defaultName);
    if (name == null) return;
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }

    setSavingTemplate(true);
    try {
      const { body, bodyDesign, subject, category, channel } = await buildPayload();
      if (isCommunicationBodyEmpty(body)) {
        setError('Message body is required');
        return;
      }
      const template = await createTemplate({
        name: name.trim(),
        subject,
        body,
        bodyDesign,
        channel,
        category
      });
      setSelectedTemplateId(String(template.id));
      await reloadTemplates();
      setSuccess(`Saved as template “${template.name}”. Find it under Templates or Start from template.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const switchEditorMode = async (mode: EditorMode) => {
    if (mode === editorMode || switchingMode) return;

    if (mode === 'visual') {
      // Keep HTML; drop design so Unlayer loads legacy HTML block.
      setForm((prev) => ({ ...prev, bodyDesign: null }));
      setTemplateVersion((v) => v + 1);
      setEditorMode('visual');
      return;
    }

    // visual → AI: export only if Unlayer is ready; never overwrite body with empty shell.
    setSwitchingMode(true);
    try {
      if (editorRef.current) {
        try {
          const { html } = await editorRef.current.exportHtml();
          const exportedBody = sanitizeCommunicationHtml(html);
          if (!isCommunicationBodyEmpty(exportedBody)) {
            setForm((prev) => ({
              ...prev,
              body: exportedBody,
              bodyDesign: null
            }));
          } else {
            setForm((prev) => ({ ...prev, bodyDesign: null }));
          }
        } catch {
          // Keep existing form.body if export is not ready yet.
          setForm((prev) => ({ ...prev, bodyDesign: null }));
        }
      } else {
        setForm((prev) => ({ ...prev, bodyDesign: null }));
      }
      setEditorMode('ai');
    } finally {
      setSwitchingMode(false);
    }
  };

  return (
    <div>
      {error ? <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div> : null}
      {success ? (
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{success}</div>
      ) : null}

      <div className="space-y-4">
        {templates.length > 0 ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Start from template (optional)</label>
            <select value={selectedTemplateId} onChange={(e) => handleApplyTemplate(e.target.value)} className={fieldClasses} aria-label="Start from a saved template">
              <option value="">None</option>
              {templates.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            className={fieldClasses}
            aria-label="Communication category"
          >
            <option value="">Select a category…</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
                {opt.allowsUnsubscribe ? '' : ' (required)'}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Required categories cannot be blocked by unsubscribe preferences.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            className={fieldClasses}
            aria-label="Email subject"
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Email message</label>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-xs font-medium dark:border-slate-600" role="group" aria-label="Editor mode">
              <button
                type="button"
                onClick={() => void switchEditorMode('ai')}
                disabled={switchingMode}
                className={`rounded-md px-2.5 py-1 disabled:opacity-50 ${
                  editorMode === 'ai' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                AI designer
              </button>
              <button
                type="button"
                onClick={() => void switchEditorMode('visual')}
                disabled={switchingMode}
                className={`rounded-md px-2.5 py-1 disabled:opacity-50 ${
                  editorMode === 'visual' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Visual editor
              </button>
            </div>
          </div>

          {editorMode === 'ai' ? (
            <AiEmailStudio
              subject={form.subject}
              body={form.body}
              category={form.category}
              onChange={({ subject, body }) =>
                setForm((prev) => ({
                  ...prev,
                  subject,
                  body,
                  bodyDesign: null
                }))
              }
            />
          ) : (
            <MessageEmailEditor
              key={`${draftId ?? 'new'}-${templateVersion}`}
              ref={editorRef}
              design={form.bodyDesign}
              legacyHtml={!form.bodyDesign ? form.body : null}
              onChange={({ html, design }) =>
                setForm((prev) => ({
                  ...prev,
                  body: sanitizeCommunicationHtml(html),
                  bodyDesign: design
                }))
              }
              helperText="Drag-and-drop email designer powered by Unlayer. Images upload to Metabolic and are embedded when sent."
            />
          )}
        </div>

        {useLocked && lockedRecipients ? (
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Sending to {lockedRecipients.length} selected user
              {lockedRecipients.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lockedRecipients.map((r) => (
                <span key={r.userId || r.email || ''} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                  {r.displayName || r.email}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <RecipientSelector recipients={form.recipients} onChange={(recipients) => setForm((prev) => ({ ...prev, recipients }))} />
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handlePreview()} disabled={previewLoading || !form.category || !hasRecipients} className={secondaryBtn}>
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview eligibility
          </button>
          <button type="button" onClick={() => void handleSaveDraft()} disabled={savingDraft || !form.category} className={secondaryBtn}>
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsTemplate()}
            disabled={savingTemplate || !form.category}
            className={secondaryBtn}
            title="Save this subject and message to reuse later from Templates"
          >
            {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutTemplate className="h-4 w-4" />}
            Save as template
          </button>
        </div>
      </div>

      <PreSendSummary summary={summary} loading={previewLoading} sending={sending} onSend={() => void handleSend()} />
    </div>
  );
}
