import { useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { searchRecipients } from '../../services/communicationsApi';
import type { RecipientInput } from '../../lib/communications/types';

const recipientKey = (r: RecipientInput): string =>
  r.userId || `${r.email || ''}:${r.phone || ''}:${r.isExternal ? 'ext' : 'user'}`;

interface RecipientSelectorProps {
  recipients: RecipientInput[];
  onChange: (recipients: RecipientInput[]) => void;
}

const inputClasses =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

export default function RecipientSelector({ recipients, onChange }: RecipientSelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecipientInput[]>([]);
  const [searching, setSearching] = useState(false);
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const users = await searchRecipients(query.trim());
      setResults(
        users.map((u) => ({
          userId: u.userId,
          displayName: u.displayName,
          email: u.email,
          phone: u.phone,
          isExternal: u.isExternal
        }))
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (recipient: RecipientInput) => {
    const key = recipientKey(recipient);
    if (recipients.some((r) => recipientKey(r) === key)) return;
    onChange([...recipients, recipient]);
    setResults([]);
    setQuery('');
  };

  const handleRemove = (key: string) => {
    onChange(recipients.filter((r) => recipientKey(r) !== key));
  };

  const handleAddExternal = () => {
    const email = externalEmail.trim() || null;
    if (!email) return;
    handleAdd({
      displayName: externalName.trim() || email,
      email,
      isExternal: true
    });
    setExternalName('');
    setExternalEmail('');
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Recipients</label>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSearch();
              }
            }}
            placeholder="Search users by name, email, or phone"
            aria-label="Search recipients"
            className={inputClasses}
          />
          {searching ? <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={query.trim().length < 2 || searching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {results.length > 0 ? (
        <ul className="mb-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {results.map((r) => (
            <li key={recipientKey(r)}>
              <button
                type="button"
                onClick={() => handleAdd(r)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <span>
                  <span className="block text-sm text-slate-800 dark:text-slate-100">{r.displayName}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{[r.email, r.phone].filter(Boolean).join(' · ')}</span>
                </span>
                <Plus className="h-4 w-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Add an external recipient by email</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={externalName}
            onChange={(e) => setExternalName(e.target.value)}
            placeholder="Name (optional)"
            aria-label="External recipient name"
            className={inputClasses}
          />
          <input
            type="email"
            value={externalEmail}
            onChange={(e) => setExternalEmail(e.target.value)}
            placeholder="Email"
            aria-label="External recipient email"
            className={inputClasses}
          />
          <button
            type="button"
            onClick={handleAddExternal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {recipients.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {recipients.map((r) => {
            const key = recipientKey(r);
            const label = r.displayName || r.email || r.phone;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-100"
              >
                {label}
                {r.isExternal ? <span className="text-xs text-slate-500 dark:text-slate-400">(external)</span> : null}
                <button
                  type="button"
                  onClick={() => handleRemove(key)}
                  aria-label={`Remove ${label}`}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">No recipients selected.</p>
      )}
    </div>
  );
}
