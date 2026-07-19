import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { UNLAYER_MERGE_TAGS } from '../../lib/communications/variables';
import { uploadCommunicationAsset } from '../../services/communicationsApi';
import { importEmailPackage } from '../../lib/communications/emailPackageImport';
import { buildDesignFromHtml } from '../../lib/communications/unlayerHtmlDesign';
import CommunicationVariablesButton, { communicationToolbarBtn } from './CommunicationVariablesButton';
import EmailEditor from './UnlayerEmailEditor';
import type { UnlayerEmailEditorHandle, UnlayerEditorInstance } from './UnlayerEmailEditor';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED_UPLOAD = /\.(html?|zip)$/i;

export interface MessageEmailEditorHandle {
  exportHtml: () => Promise<{ html: string; design: unknown }>;
}

interface MessageEmailEditorProps {
  design?: unknown;
  legacyHtml?: string | null;
  onChange?: (data: { html: string; design: unknown }) => void;
  helperText?: string;
  minHeight?: number;
}

const UNLAYER_PROJECT_ID = import.meta.env.VITE_UNLAYER_PROJECT_ID;

const UNLAYER_OPTIONS = {
  ...(UNLAYER_PROJECT_ID ? { projectId: Number(UNLAYER_PROJECT_ID) } : {}),
  displayMode: 'email' as const,
  mergeTags: UNLAYER_MERGE_TAGS,
  features: { preview: true, stockImages: false }
};

const MessageEmailEditor = forwardRef<MessageEmailEditorHandle, MessageEmailEditorProps>(function MessageEmailEditor(
  { design, legacyHtml, onChange, helperText, minHeight = 520 },
  ref
) {
  const emailEditorRef = useRef<UnlayerEmailEditorHandle>(null);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importInfo, setImportInfo] = useState('');

  const exportHtml = useCallback(
    () =>
      new Promise<{ html: string; design: unknown }>((resolve, reject) => {
        const editor = emailEditorRef.current?.editor;
        if (!editor) {
          reject(new Error('Email editor is not ready'));
          return;
        }
        editor.exportHtml((data) => resolve({ html: data.html, design: data.design }));
      }),
    []
  );

  useImperativeHandle(ref, () => ({ exportHtml }), [exportHtml]);

  const handleReady = useCallback(
    (editor: UnlayerEditorInstance) => {
      setReady(true);

      if (design) {
        editor.loadDesign(design);
      } else if (legacyHtml?.trim()) {
        // Load prior HTML (no saved design) as an editable Unlayer HTML block.
        editor.loadDesign(buildDesignFromHtml(legacyHtml));
      }

      // Route image uploads through the admin communications asset endpoint.
      editor.registerCallback('image', async (file, done) => {
        try {
          const uploaded = file.attachments?.[0];
          if (!uploaded) return;
          const url = await uploadCommunicationAsset(uploaded);
          done({ progress: 100, url });
        } catch {
          /* upload failed; Unlayer keeps the picker open */
        }
      });

      const handler = () => {
        if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
        exportTimeoutRef.current = setTimeout(async () => {
          try {
            onChange?.(await exportHtml());
          } catch {
            /* editor still initializing */
          }
        }, 400);
      };
      editor.addEventListener('design:updated', handler);
    },
    [design, legacyHtml, onChange, exportHtml]
  );

  const handleImportClick = useCallback(() => {
    setImportError('');
    setImportInfo('');
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setImportError('');
      setImportInfo('');

      if (!ACCEPTED_UPLOAD.test(file.name)) {
        setImportError('Please choose an .html file or a .zip containing the email and its images.');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setImportError('That file is too large (max 25 MB).');
        return;
      }

      const editor = emailEditorRef.current?.editor;
      if (!editor) {
        setImportError('Email editor is not ready yet. Please try again.');
        return;
      }

      setImporting(true);
      try {
        const { html, embedded, unresolved } = await importEmailPackage(file);
        editor.loadDesign(buildDesignFromHtml(html));

        try {
          onChange?.(await exportHtml());
        } catch {
          /* design:updated keeps state in sync */
        }

        const parts: string[] = [];
        if (embedded > 0) parts.push(`${embedded} image${embedded === 1 ? '' : 's'} embedded`);
        if (unresolved > 0) parts.push(`${unresolved} image${unresolved === 1 ? '' : 's'} could not be found and may appear broken`);
        setImportInfo(parts.length ? `HTML imported — ${parts.join('; ')}.` : 'HTML imported into the editor.');
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Could not import that file.');
      } finally {
        setImporting(false);
      }
    },
    [exportHtml, onChange]
  );

  useEffect(
    () => () => {
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
    },
    []
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleImportClick}
          disabled={!ready || importing}
          aria-label="Upload an HTML file or a .zip containing the email and its images"
          className={`${communicationToolbarBtn} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
          {importing ? 'Importing…' : 'Upload HTML / .zip'}
        </button>
        <CommunicationVariablesButton compact />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,.zip,text/html,application/zip"
        onChange={(event) => void handleFileSelected(event)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {importError ? (
        <div
          role="alert"
          className="mb-1 flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>{importError}</span>
          <button type="button" onClick={() => setImportError('')} aria-label="Dismiss error" className="font-medium hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}
      {importInfo ? (
        <div
          role="status"
          className="mb-1 flex items-start justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-300"
        >
          <span>{importInfo}</span>
          <button type="button" onClick={() => setImportInfo('')} aria-label="Dismiss message" className="font-medium hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}
      {helperText ? <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{helperText}</p> : null}
      <div className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" style={{ minHeight }}>
        {!ready ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-slate-500 dark:bg-slate-900/80"
            aria-live="polite"
          >
            Loading email editor…
          </div>
        ) : null}
        {/* Keep the editor sized/visible while loading — Unlayer will not
            finish initializing in a display:none container. */}
        <EmailEditor ref={emailEditorRef} onReady={handleReady} options={UNLAYER_OPTIONS} minHeight={`${minHeight}px`} />
      </div>
    </div>
  );
});

export default MessageEmailEditor;
