import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { Food } from '../types';

export type PendingFoodLookup = {
  lookupId: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodSearchResponse = {
  local: Food[];
  queue: Food[];
  pending: PendingFoodLookup[];
};

export type FoodLookupOption = {
  lookupId: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
};

export function formatFoodMacros(food: Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(food.calories))} kcal · ${Math.round(Number(food.protein))}P · ${Math.round(Number(food.carbs))}C · ${Math.round(Number(food.fat))}F`;
}

export function pendingToFood(pending: PendingFoodLookup): Food {
  return {
    id: pending.lookupId,
    name: pending.name,
    servingSize: pending.servingSize,
    servingUnit: pending.servingUnit,
    calories: pending.calories,
    protein: pending.protein,
    carbs: pending.carbs,
    fat: pending.fat
  };
}

export function useFoodSearchWithAi(query: string) {
  const [local, setLocal] = useState<Food[]>([]);
  const [queue, setQueue] = useState<Food[]>([]);
  const [pending, setPending] = useState<PendingFoodLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [aiOptions, setAiOptions] = useState<FoodLookupOption[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiRequestId = useRef(0);

  useEffect(() => {
    setAiOptions([]);
    setAiError(null);
    if (query.trim().length < 2) {
      setLocal([]);
      setQueue([]);
      setPending([]);
      setSearchError(null);
      setSearched(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      api<FoodSearchResponse>(`/api/foods/search?query=${encodeURIComponent(query.trim())}`)
        .then((result) => {
          setLocal(result.local);
          setQueue(result.queue);
          setPending(result.pending);
          setSearched(true);
        })
        .catch((err) => {
          setLocal([]);
          setQueue([]);
          setPending([]);
          setSearched(true);
          setSearchError(err instanceof Error ? err.message : 'Food search failed');
        })
        .finally(() => setSearching(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = local.length + queue.length + pending.length > 0;

  const runAiSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    const requestId = ++aiRequestId.current;
    setAiLoading(true);
    setAiError(null);
    setAiOptions([]);
    try {
      const result = await api<{ options: FoodLookupOption[] }>('/api/ai/food-lookup/options', {
        method: 'POST',
        body: JSON.stringify({ query: q })
      });
      if (requestId !== aiRequestId.current) return;
      setAiOptions(result.options);
    } catch (err) {
      if (requestId !== aiRequestId.current) return;
      setAiError(err instanceof Error ? err.message : 'AI food search failed');
    } finally {
      if (requestId === aiRequestId.current) setAiLoading(false);
    }
  }, [query]);

  const acceptLookup = useCallback(async (lookupId: string) => {
    return api<Food>(`/api/ai/food-lookup/${lookupId}/accept`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }, []);

  const resetAi = useCallback(() => {
    setAiOptions([]);
    setAiError(null);
    setAiLoading(false);
  }, []);

  return {
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
  };
}
