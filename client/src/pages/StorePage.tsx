import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import { api } from '../services/api';
import type { AppUser, StoreOrder, StoreProduct, StoreProductCategory } from '../types';
import { formatCents, useStoreCart } from '../hooks/useStoreCart';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { CartDrawer } from '../components/store/CartDrawer';

type CategoryFilter = 'ALL' | StoreProductCategory;

const CATEGORY_LABELS: Array<[CategoryFilter, string]> = [
  ['ALL', 'All'],
  ['SUPPLEMENT', 'Supplements'],
  ['PROTEIN', 'Protein'],
  ['EQUIPMENT', 'Equipment'],
  ['OTHER', 'Other']
];

function formatOrderDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function StorePage({ user }: { user: AppUser | null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const storeEnabled = user?.storeEnabled !== false;

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [cartOpen, setCartOpen] = useState(false);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [checkoutState, setCheckoutState] = useState<'success' | 'processing' | 'canceled' | null>(null);

  const { cart, error: cartError, updating, setItem, refresh, clearLocal } = useStoreCart(storeEnabled);

  useEffect(() => {
    if (!storeEnabled) navigate('/', { replace: true });
  }, [storeEnabled, navigate]);

  useEffect(() => {
    if (!storeEnabled) return;
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      setLoading(true);
      api<StoreProduct[]>('/api/store/products')
        .then((data) => {
          if (!canceled) setProducts(data);
        })
        .catch((err) => {
          if (!canceled) setLoadError(err instanceof Error ? err.message : 'Could not load the store.');
        })
        .finally(() => {
          if (!canceled) setLoading(false);
        });
      api<StoreOrder[]>('/api/store/orders')
        .then((data) => {
          if (!canceled) setOrders(data);
        })
        .catch(() => undefined);
    });
    return () => {
      canceled = true;
    };
  }, [storeEnabled]);

  // Handle the return from Stripe checkout.
  useEffect(() => {
    const result = searchParams.get('checkout');
    if (!result) return;
    const sessionId = searchParams.get('session_id');
    queueMicrotask(() => {
      setSearchParams({}, { replace: true });

      if (result === 'cancel') {
        setCheckoutState('canceled');
        return;
      }
      if (result === 'success' && sessionId) {
        api<{ status: 'paid' | 'processing' | 'canceled' }>(
          `/api/store/checkout/confirm?sessionId=${encodeURIComponent(sessionId)}`
        )
          .then((confirm) => {
            if (confirm.status === 'paid') {
              setCheckoutState('success');
              clearLocal();
              api<StoreOrder[]>('/api/store/orders').then(setOrders).catch(() => undefined);
            } else {
              setCheckoutState('processing');
              void refresh();
            }
          })
          .catch(() => setCheckoutState('processing'));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleProducts = useMemo(
    () => (category === 'ALL' ? products : products.filter((product) => product.category === category)),
    [products, category]
  );

  if (!storeEnabled) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Store</h1>
          <p className="mt-1 text-sm text-app-text opacity-80">
            Supplements, protein, and equipment we trust to support your program.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setCartOpen(true)}>
          <ShoppingCart className="mr-1.5 inline h-4 w-4" />
          Cart{cart.itemCount > 0 ? ` (${cart.itemCount})` : ''}
        </Button>
      </div>

      {checkoutState === 'success' && (
        <div className="flex items-center gap-2 rounded-2xl border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-app-text">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-green" />
          Order confirmed! A receipt is on its way to your email.
        </div>
      )}
      {checkoutState === 'processing' && (
        <div className="rounded-2xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text opacity-80">
          Payment received — your order is being confirmed. Check your orders below in a moment.
        </div>
      )}
      {checkoutState === 'canceled' && (
        <div className="rounded-2xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text opacity-80">
          Checkout canceled — your cart is untouched.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {CATEGORY_LABELS.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={category === value ? 'primary' : 'secondary'}
            onClick={() => setCategory(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-app-text opacity-80">Loading products…</p>}
      {loadError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {cartError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{cartError}</p>}

      {!loading && !loadError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => {
            const inCart = cart.items.find((item) => item.productId === product.id);
            return (
              <Card key={product.id} className="flex flex-col">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-40 w-full rounded-xl bg-white object-contain"
                  />
                ) : (
                  <div className="h-40 w-full rounded-xl bg-app-muted" />
                )}
                <h3 className="mt-3 text-sm font-semibold text-app-text">{product.name}</h3>
                <p className="mt-1 flex-1 text-xs text-app-text-muted">{product.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-app-text">{formatCents(product.priceCents)}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={updating}
                    onClick={() => void setItem(product.id, (inCart?.quantity ?? 0) + 1)}
                  >
                    {inCart ? `Add another (${inCart.quantity})` : 'Add to cart'}
                  </Button>
                </div>
              </Card>
            );
          })}
          {visibleProducts.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-app-border px-4 py-8 text-center text-sm text-app-text opacity-80">
              No products in this category yet.
            </p>
          )}
        </div>
      )}

      {orders.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-app-text">Your orders</h2>
          <ul className="mt-3 space-y-3">
            {orders.map((order) => (
              <li key={order.id} className="rounded-2xl border border-app-border bg-app-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-app-text">
                    {formatOrderDate(order.paidAt ?? order.createdAt)} · {formatCents(order.totalCents)}
                  </span>
                  <span className="rounded-full bg-app-muted px-2 py-1 text-xs font-medium text-app-text-muted">
                    {order.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-app-text-muted">
                  {order.items.map((item) => `${item.quantity} × ${item.nameSnapshot}`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CartDrawer open={cartOpen} cart={cart} updating={updating} onClose={() => setCartOpen(false)} onSetItem={setItem} />
    </div>
  );
}
