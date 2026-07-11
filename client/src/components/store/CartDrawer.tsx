import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { StoreCart } from '../../types';
import { formatCents } from '../../hooks/useStoreCart';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

export function CartDrawer({
  open,
  cart,
  updating,
  onClose,
  onSetItem
}: {
  open: boolean;
  cart: StoreCart;
  updating: boolean;
  onClose: () => void;
  onSetItem: (productId: string, quantity: number) => Promise<void>;
}) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (!cart.items.length || checkingOut) return;
    setError(null);
    setCheckingOut(true);
    try {
      const { url } = await api<{ url: string }>('/api/store/checkout', { method: 'POST' });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setCheckingOut(false);
    }
  }

  return (
    <Drawer open={open} title="Your cart" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        {cart.items.length === 0 ? (
          <p className="text-sm text-app-text-muted">Your cart is empty — add something from the store.</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3 rounded-2xl border border-app-border p-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-app-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-app-text">{item.name}</p>
                  <p className="mt-0.5 text-xs text-app-text-muted">
                    {formatCents(item.priceCents)} each · {formatCents(item.lineTotalCents)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name} quantity`}
                      disabled={updating}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-app-border text-app-text transition hover:bg-app-muted disabled:opacity-40"
                      onClick={() => void onSetItem(item.productId, item.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-app-text">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name} quantity`}
                      disabled={updating || item.quantity >= 20}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-app-border text-app-text transition hover:bg-app-muted disabled:opacity-40"
                      onClick={() => void onSetItem(item.productId, item.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      disabled={updating}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-app-text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      onClick={() => void onSetItem(item.productId, 0)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-4 shrink-0 border-t border-app-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-app-text-muted">Subtotal</span>
            <span className="text-base font-bold text-app-text">{formatCents(cart.totalCents)}</span>
          </div>
          <p className="mt-1 text-xs text-app-text-muted">Shipping is collected securely at checkout.</p>
          <Button
            type="button"
            className="mt-3 w-full"
            disabled={!cart.items.length || updating || checkingOut}
            onClick={() => void handleCheckout()}
          >
            {checkingOut ? 'Heading to checkout…' : 'Checkout'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
