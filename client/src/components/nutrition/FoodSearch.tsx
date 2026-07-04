import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Food } from '../../types';
import {
  formatFoodMacros,
  useFoodSearchWithAi,
  type FoodLookupOption,
  type PendingFoodLookup
} from '../../hooks/useFoodSearchWithAi';

function SectionLabel({ children }: { children: string }) {
  return <li className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-app-text-muted">{children}</li>;
}

function FoodResultButton({
  label,
  macros,
  hint,
  onClick
}: {
  label: string;
  macros: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-app-text hover:bg-app-muted"
        onClick={onClick}
      >
        <span className="font-medium">{label}</span>
        {hint ? <span className="ml-2 text-xs text-brand-green">{hint}</span> : null}
        <span className="ml-2 text-app-text-muted">{macros}</span>
      </button>
    </li>
  );
}

export function FoodSearch({
  onSelect,
  dropUp = false
}: {
  onSelect: (food: Food) => void;
  dropUp?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const {
    local,
    queue,
    pending,
    searching,
    searchError,
    searched,
    hasResults,
    aiOptions,
    aiLoading,
    aiError,
    runAiSearch,
    acceptLookup,
    resetAi
  } = useFoodSearchWithAi(query);

  useEffect(() => {
    resetAi();
    setAcceptError(null);
  }, [query, resetAi]);

  const showDropdown = query.trim().length >= 2 && (searching || searched || aiLoading || aiOptions.length > 0 || aiError || acceptError);

  async function selectFood(food: Food) {
    setAcceptError(null);
    onSelect(food);
    setQuery('');
    resetAi();
  }

  async function selectPending(item: PendingFoodLookup) {
    try {
      const food = await acceptLookup(item.lookupId);
      await selectFood(food);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Could not save that food.');
    }
  }

  async function selectAiOption(option: FoodLookupOption) {
    try {
      const food = await acceptLookup(option.lookupId);
      await selectFood(food);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Could not save that food.');
    }
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-2xl border border-app-border bg-app-surface p-3 text-app-text placeholder:text-app-text-muted"
        placeholder="Search foods by name or alias"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {showDropdown && (
        <ul
          className={`absolute z-[100] max-h-64 w-full overflow-y-auto rounded-2xl border border-app-border bg-app-surface shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'mt-1'
          }`}
        >
          {searching && <li className="px-4 py-2 text-sm text-app-text-muted">Searching…</li>}
          {!searching && searchError && <li className="px-4 py-2 text-sm text-red-600">{searchError}</li>}

          {!searching && !searchError && local.length > 0 && (
            <>
              <SectionLabel>Foods</SectionLabel>
              {local.map((food) => (
                <FoodResultButton
                  key={food.id}
                  label={food.name}
                  macros={`${Math.round(Number(food.calories))} kcal`}
                  onClick={() => void selectFood(food)}
                />
              ))}
            </>
          )}

          {!searching && !searchError && queue.length > 0 && (
            <>
              <SectionLabel>AI review queue</SectionLabel>
              {queue.map((food) => (
                <FoodResultButton
                  key={food.id}
                  label={food.name}
                  macros={`${Math.round(Number(food.calories))} kcal`}
                  hint="pending review"
                  onClick={() => void selectFood(food)}
                />
              ))}
            </>
          )}

          {!searching && !searchError && pending.length > 0 && (
            <>
              <SectionLabel>Your AI lookups</SectionLabel>
              {pending.map((item) => (
                <FoodResultButton
                  key={item.lookupId}
                  label={item.name}
                  macros={formatFoodMacros(item)}
                  hint="saved lookup"
                  onClick={() => void selectPending(item)}
                />
              ))}
            </>
          )}

          {!searching && !aiLoading && searched && !hasResults && aiOptions.length === 0 && !aiError && (
            <li className="px-4 py-2 text-sm text-app-text-muted">No foods found in your library or AI queue.</li>
          )}

          {!searching && !aiLoading && aiOptions.length === 0 && !aiError && query.trim().length >= 2 && !hasResults && (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-brand-green hover:bg-app-muted"
                onClick={() => void runAiSearch()}
              >
                <Sparkles size={14} />
                Search with AI for &quot;{query.trim()}&quot;
              </button>
            </li>
          )}

          {aiLoading && <li className="px-4 py-2 text-sm text-app-text-muted">Asking AI for matches…</li>}
          {aiError && (
            <li className="px-4 py-2 text-sm text-red-600">
              {aiError}
              <button type="button" className="ml-2 font-bold underline" onClick={() => void runAiSearch()}>
                Try again
              </button>
            </li>
          )}
          {acceptError && <li className="px-4 py-2 text-sm text-red-600">{acceptError}</li>}

          {!aiLoading &&
            aiOptions.map((option) => (
              <FoodResultButton
                key={option.lookupId}
                label={option.name}
                macros={formatFoodMacros(option)}
                hint="AI estimate"
                onClick={() => void selectAiOption(option)}
              />
            ))}
        </ul>
      )}
    </div>
  );
}
