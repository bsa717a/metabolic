import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import type { AdminStoreProduct } from '../../types';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EditStoreProductDrawer } from './EditStoreProductDrawer';

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function categoryLabel(category: string) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

export function StoreProductsTable() {
  const [products, setProducts] = useState<AdminStoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStoreProduct | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProducts(await api<AdminStoreProduct[]>('/api/admin/store/products'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query)
    );
  }, [products, search]);

  function upsertLocal(saved: AdminStoreProduct) {
    setProducts((current) => {
      const exists = current.some((product) => product.id === saved.id);
      const next = exists
        ? current.map((product) => (product.id === saved.id ? saved : product))
        : [...current, saved];
      return next.sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      );
    });
  }

  async function toggleActive(product: AdminStoreProduct) {
    setBusyId(product.id);
    try {
      const saved = await api<AdminStoreProduct>(`/api/admin/store/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !product.active })
      });
      upsertLocal(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(product: AdminStoreProduct, direction: 'up' | 'down') {
    setBusyId(product.id);
    try {
      await api(`/api/admin/store/products/${product.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder product.');
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setEditing(undefined);
    setDrawerOpen(true);
  }

  function openEdit(product: AdminStoreProduct) {
    setEditing(product);
    setDrawerOpen(true);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-app-text">Products</h2>
          <p className="mt-0.5 text-sm text-app-text-muted">
            {products.length} product{products.length === 1 ? '' : 's'} · reorder with the arrows within each category.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 inline h-4 w-4" />
          Add product
        </Button>
      </div>

      <input
        className="mt-4 w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40"
        placeholder="Search products…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-app-text-muted">Loading products…</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-app-border text-left text-xs uppercase tracking-wide text-app-text-muted">
                <th className="py-2 pr-3">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Reorder</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className="border-b border-app-border/60">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-lg bg-app-muted" />
                      )}
                      <span className="font-medium text-app-text">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-app-text-muted">{categoryLabel(product.category)}</td>
                  <td className="px-3 py-2 text-app-text">{formatCents(product.priceCents)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={product.active ? 'green' : 'slate'}>{product.active ? 'Active' : 'Archived'}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={busyId === product.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-app-border text-app-text transition hover:bg-app-muted disabled:opacity-40"
                        onClick={() => void move(product, 'up')}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={busyId === product.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-app-border text-app-text transition hover:bg-app-muted disabled:opacity-40"
                        onClick={() => void move(product, 'down')}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(product)}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyId === product.id}
                        onClick={() => void toggleActive(product)}
                      >
                        {product.active ? 'Archive' : 'Restore'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-app-text-muted">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <EditStoreProductDrawer
        open={drawerOpen}
        product={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={upsertLocal}
      />
    </Card>
  );
}
