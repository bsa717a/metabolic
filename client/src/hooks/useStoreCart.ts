import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { StoreCart } from '../types';

const EMPTY_CART: StoreCart = { items: [], totalCents: 0, itemCount: 0 };

export function useStoreCart(enabled: boolean) {
  const [cart, setCart] = useState<StoreCart>(EMPTY_CART);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setCart(await api<StoreCart>('/api/store/cart'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your cart.');
    }
  }, [enabled]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const setItem = useCallback(async (productId: string, quantity: number) => {
    setUpdating(true);
    setError(null);
    try {
      const next = await api<StoreCart>('/api/store/cart/items', {
        method: 'PUT',
        body: JSON.stringify({ productId, quantity })
      });
      setCart(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your cart.');
    } finally {
      setUpdating(false);
    }
  }, []);

  const clearLocal = useCallback(() => setCart(EMPTY_CART), []);

  return { cart, error, updating, setItem, refresh, clearLocal };
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
