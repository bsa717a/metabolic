import { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { generateCommunicationEmail, type AiEmailGenerateResult } from '../../services/communicationsApi';
import { sanitizeCommunicationHtml } from '../../lib/communications/htmlUtils';
import { applyCommunicationVariables, COMMUNICATION_VARIABLES } from '../../lib/communications/variables';
import CommunicationVariablesButton, { communicationToolbarBtn } from './CommunicationVariablesButton';

type ThreadRole = 'user' | 'assistant';

interface ThreadMessage {
  id: string;
  role: ThreadRole;
  text: string;
}

interface AiEmailStudioProps {
  subject: string;
  body: string;
  category: string;
  onChange: (data: { subject: string; body: string }) => void;
}

const SAMPLE_CONTEXT: Record<string, string> = COMMUNICATION_VARIABLES.reduce(
  (acc, v) => {
    acc[v.key] = v.sample;
    return acc;
  },
  {} as Record<string, string>
);

function insertAtCursor(el: HTMLTextAreaElement | null, current: string, token: string, setValue: (next: string) => void) {
  if (!el) {
    setValue(current ? `${current} ${token}` : token);
    return;
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
  setValue(next);
  requestAnimationFrame(() => {
    const pos = start + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

export default function AiEmailStudio({ subject, body, category, onChange }: AiEmailStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageWarning, setImageWarning] = useState('');

  const promptRef = useRef<HTMLTextAreaElement>(null);

  const previewHtml = useMemo(() => {
    const sanitized = sanitizeCommunicationHtml(body);
    if (!sanitized) return '';
    return applyCommunicationVariables(sanitized, SAMPLE_CONTEXT, { escape: true });
  }, [body]);

  const hasDesign = Boolean(sanitizeCommunicationHtml(body).trim());

  const applyResult = useCallback(
    (result: AiEmailGenerateResult) => {
      onChange({
        subject: result.subject,
        body: sanitizeCommunicationHtml(result.html)
      });
    },
    [onChange]
  );

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed && !hasDesign) {
      setError('Describe the email you want to create.');
      return;
    }
    if (!trimmed && hasDesign) {
      setError('Describe how you want to refine the email.');
      return;
    }

    setError('');
    setImageWarning('');
    setLoading(true);
    const userMsg: ThreadMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed
    };
    setThread((prev) => [...prev, userMsg]);
    setPrompt('');

    try {
      const result = await generateCommunicationEmail({
        prompt: trimmed,
        existingSubject: subject || undefined,
        existingHtml: hasDesign ? body : undefined,
        category: category || undefined
      });
      applyResult(result);
      if (result.imageError) {
        setImageWarning(`Email generated, but the photo could not be created: ${result.imageError}`);
      }
      setThread((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: hasDesign ? 'Updated the email from your instructions.' : 'Generated a draft. Use Refine below to change the wording or layout.'
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generate failed');
      setThread((prev) => prev.slice(0, -1));
      setPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (hasDesign && !window.confirm('Clear the current email design?')) return;
    onChange({ subject: '', body: '' });
    setThread([]);
    setError('');
    setImageWarning('');
  };

  const handleInsertVariable = (token: string) => {
    insertAtCursor(promptRef.current, prompt, token, setPrompt);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Describe the email, then refine the wording with follow-ups. Subject can be edited above; preview uses sample variable values.
        </p>
        <div className="flex items-center gap-2">
          <CommunicationVariablesButton compact onInsert={handleInsertVariable} helperText="Insert into your prompt." />
          {hasDesign ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className={`${communicationToolbarBtn} disabled:opacity-50`}
              aria-label="Clear email design"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {thread.length > 0 ? (
        <ul className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40" aria-label="AI conversation">
          {thread.map((msg) => (
            <li key={msg.id} className={msg.role === 'user' ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}>
              <span className="font-medium text-xs uppercase tracking-wide text-slate-400">{msg.role === 'user' ? 'You' : 'AI'} </span>
              {msg.text}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <label className="sr-only" htmlFor="ai-email-prompt">
          Email design prompt
        </label>
        <textarea
          id="ai-email-prompt"
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={
            hasDesign
              ? 'e.g. Rebuild as a marketing email: dark header, headline, 3 benefit rows, blue CTA'
              : 'e.g. Announce the new SMS coach feature — marketing layout with headline, benefits, and CTA; use {{recipient_name}}'
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          disabled={loading}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {hasDesign ? 'Refine' : 'Generate'}
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {imageWarning ? (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {imageWarning}
        </div>
      ) : null}

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Preview</span>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          {previewHtml ? (
            <iframe
              title="Email preview"
              // allow-same-origin so brand assets (e.g. /logo.png) can load in the preview
              sandbox="allow-same-origin"
              srcDoc={previewHtml}
              className="w-full bg-white"
              style={{ height: 720, minHeight: 720, border: 0 }}
            />
          ) : (
            <div className="flex items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400" style={{ height: 720, minHeight: 720 }}>
              Generate an email to see a live preview here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
