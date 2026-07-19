/**
 * Thin Unlayer embed wrapper.
 *
 * react-email-editor's embed.js calls bare `unlayer.createEditor(...)` and
 * reads `document.currentScript.src` to resolve editor assets, which breaks
 * for dynamically inserted scripts. The server proxies + patches the embed
 * script (see /api/admin/communications/unlayer-embed) so we load it from
 * there and use window.unlayer explicitly.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { UNLAYER_EMBED_URL } from '../../services/communicationsApi';

export interface UnlayerEditorInstance {
  exportHtml: (cb: (data: { html: string; design: unknown }) => void) => void;
  loadDesign: (design: unknown) => void;
  addEventListener: (event: string, cb: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  registerCallback: (
    type: string,
    cb: (file: { attachments: File[] }, done: (data: { progress: number; url: string }) => void) => void
  ) => void;
  destroy?: () => void;
}

export interface UnlayerEmailEditorHandle {
  editor: UnlayerEditorInstance | null;
}

interface UnlayerEmailEditorProps {
  options?: Record<string, unknown>;
  minHeight?: number | string;
  onReady?: (editor: UnlayerEditorInstance) => void;
}

declare global {
  interface Window {
    unlayer?: {
      createEditor: (options: Record<string, unknown>) => UnlayerEditorInstance;
    };
    __unlayer_lastEditorId?: number;
    __unlayer_script_promise?: Promise<void>;
  }
}

function nextEditorId(): string {
  if (typeof window === 'undefined') return 'editor-ssr';
  window.__unlayer_lastEditorId = (window.__unlayer_lastEditorId || 0) + 1;
  return `editor-${window.__unlayer_lastEditorId}`;
}

function loadUnlayerScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Unlayer requires a browser'));
  }
  if (window.unlayer?.createEditor) return Promise.resolve();
  if (window.__unlayer_script_promise) return window.__unlayer_script_promise;

  window.__unlayer_script_promise = new Promise<void>((resolve, reject) => {
    // Drop any prior broken CDN script tags from earlier attempts.
    document
      .querySelectorAll<HTMLScriptElement>(`script[src*="editor.unlayer.com/embed.js"], script[data-unlayer-embed="1"]`)
      .forEach((el) => el.remove());

    const script = document.createElement('script');
    script.dataset.unlayerEmbed = '1';
    script.async = false;
    script.src = UNLAYER_EMBED_URL;
    script.onload = () => {
      if (window.unlayer?.createEditor) {
        resolve();
        return;
      }
      window.__unlayer_script_promise = undefined;
      reject(new Error('Unlayer script loaded but window.unlayer is missing'));
    };
    script.onerror = () => {
      window.__unlayer_script_promise = undefined;
      reject(new Error('Failed to load Unlayer script'));
    };
    document.head.appendChild(script);
  });

  return window.__unlayer_script_promise;
}

const UnlayerEmailEditor = forwardRef<UnlayerEmailEditorHandle, UnlayerEmailEditorProps>(function UnlayerEmailEditor(
  { options = {}, minHeight = 500, onReady },
  ref
) {
  const [error, setError] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<UnlayerEditorInstance | null>(null);
  const onReadyRef = useRef(onReady);
  const optionsRef = useRef(options);
  const readyFiredRef = useRef(false);
  onReadyRef.current = onReady;
  optionsRef.current = options;

  const optionsKey = JSON.stringify(options);

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editorRef.current;
      }
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let created: UnlayerEditorInstance | null = null;
    let readyFallback: ReturnType<typeof setTimeout> | null = null;
    const editorId = nextEditorId();
    readyFiredRef.current = false;

    const fireReady = (instance: UnlayerEditorInstance) => {
      if (cancelled || readyFiredRef.current) return;
      readyFiredRef.current = true;
      onReadyRef.current?.(instance);
    };

    const mount = async () => {
      setError('');
      const host = hostRef.current;
      if (!host) {
        setError('Editor container is missing');
        return;
      }

      host.id = editorId;
      host.replaceChildren();

      try {
        await loadUnlayerScript();
        if (cancelled || !window.unlayer?.createEditor) return;

        created = window.unlayer.createEditor({
          ...optionsRef.current,
          id: editorId,
          displayMode: (optionsRef.current.displayMode as string) || 'email'
        });

        if (cancelled) {
          created.destroy?.();
          return;
        }

        editorRef.current = created;
        created.addEventListener('editor:ready', () => fireReady(created!));
        readyFallback = setTimeout(() => fireReady(created!), 1500);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start visual editor');
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      if (readyFallback) clearTimeout(readyFallback);
      created?.destroy?.();
      editorRef.current?.destroy?.();
      editorRef.current = null;
      if (hostRef.current) hostRef.current.replaceChildren();
    };
  }, [optionsKey]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-red-600 dark:text-red-300" style={{ minHeight }} role="alert">
        {error}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight }}>
      <div ref={hostRef} style={{ flex: 1, width: '100%', minHeight }} />
    </div>
  );
});

export default UnlayerEmailEditor;
