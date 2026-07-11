import { useState } from 'react';
import type { AdminStoreProduct, StoreProductCategory } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

const CATEGORIES: StoreProductCategory[] = ['SUPPLEMENT', 'PROTEIN', 'EQUIPMENT', 'OTHER'];

type ProductDraft = {
  name: string;
  description: string;
  category: StoreProductCategory;
  priceDollars: string;
  imageUrl: string;
  active: boolean;
};

function toDraft(product?: AdminStoreProduct): ProductDraft {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? 'SUPPLEMENT',
    priceDollars: product ? (product.priceCents / 100).toFixed(2) : '',
    imageUrl: product?.imageUrl ?? '',
    active: product?.active ?? true
  };
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-app-text';
}

function inputClassName() {
  return 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40';
}

export function EditStoreProductDrawer({
  open,
  product,
  onClose,
  onSaved
}: {
  open: boolean;
  /** undefined = create mode */
  product?: AdminStoreProduct;
  onClose: () => void;
  onSaved: (product: AdminStoreProduct) => void;
}) {
  return (
    <Drawer open={open} title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      {open && (
        <EditStoreProductContent key={product?.id ?? 'new'} product={product} onClose={onClose} onSaved={onSaved} />
      )}
    </Drawer>
  );
}

function EditStoreProductContent({
  product,
  onClose,
  onSaved
}: {
  product?: AdminStoreProduct;
  onClose: () => void;
  onSaved: (product: AdminStoreProduct) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft<K extends keyof ProductDraft>(field: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      if (!draft.name.trim()) throw new Error('Name is required.');
      if (!draft.description.trim()) throw new Error('Description is required.');
      const priceText = draft.priceDollars.trim();
      if (!priceText) throw new Error('Price is required.');
      const priceDollars = Number(priceText);
      if (!Number.isFinite(priceDollars) || priceDollars < 0) throw new Error('Price must be a non-negative number.');
      const priceCents = Math.round(priceDollars * 100);

      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category,
        priceCents,
        imageUrl: draft.imageUrl.trim() ? draft.imageUrl.trim() : null,
        active: draft.active
      };

      const saved = product
        ? await api<AdminStoreProduct>(`/api/admin/store/products/${product.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          })
        : await api<AdminStoreProduct>('/api/admin/store/products', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={labelClassName()}>Name</span>
        <input className={inputClassName()} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
      </label>

      <label className="block">
        <span className={labelClassName()}>Description</span>
        <textarea
          className={`${inputClassName()} min-h-[72px] resize-y`}
          value={draft.description}
          onChange={(event) => updateDraft('description', event.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClassName()}>Category</span>
          <select
            className={inputClassName()}
            value={draft.category}
            onChange={(event) => updateDraft('category', event.target.value as StoreProductCategory)}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0) + category.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClassName()}>Price (USD)</span>
          <input
            className={inputClassName()}
            type="number"
            step="0.01"
            min="0"
            value={draft.priceDollars}
            onChange={(event) => updateDraft('priceDollars', event.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>

      <label className="block">
        <span className={labelClassName()}>Image URL</span>
        <input
          className={inputClassName()}
          value={draft.imageUrl}
          onChange={(event) => updateDraft('imageUrl', event.target.value)}
          placeholder="https://…"
        />
      </label>
      {draft.imageUrl.trim() && (
        <img
          src={draft.imageUrl.trim()}
          alt="Product preview"
          className="h-32 w-32 rounded-xl border border-app-border bg-white object-contain"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}

      <label className="flex items-center gap-2 text-sm text-app-text">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => updateDraft('active', event.target.checked)}
          className="h-4 w-4 rounded border-app-border accent-brand-green"
        />
        Active (visible in the storefront)
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
