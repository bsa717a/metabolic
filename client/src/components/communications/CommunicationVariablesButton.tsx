import { useEffect, useRef, useState } from 'react';
import { Braces, Check, Copy } from 'lucide-react';
import { COMMUNICATION_VARIABLES } from '../../lib/communications/variables';

export const communicationToolbarBtn =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-xs font-medium leading-none text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';

interface CommunicationVariablesButtonProps {
  compact?: boolean;
  /** When set, clicking a variable inserts it (and still copies to clipboard). */
  onInsert?: (token: string) => void;
  helperText?: string;
}

/** Dropdown listing available merge variables; click to copy (and optionally insert). */
export default function CommunicationVariablesButton({ compact = false, onInsert, helperText }: CommunicationVariablesButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleSelect = async (token: string) => {
    onInsert?.(token);
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
    if (onInsert) setOpen(false);
  };

  return (
    <div className={`relative ${compact ? 'inline-flex' : ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? communicationToolbarBtn
            : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Braces className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        Variables
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          role="menu"
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {helperText || (onInsert ? 'Click a variable to insert it (also copied to clipboard).' : 'Click a variable to copy its token, then paste it into the subject or body.')}
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {COMMUNICATION_VARIABLES.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => void handleSelect(v.token)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{v.label}</span>
                    <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">{v.token}</span>
                  </span>
                  {copied === v.token ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Copy className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
