import { useCallback, useEffect, useState } from 'react';
import type { AdminStoreOrder, AdminStoreOrdersPage, StoreOrderStatus } from '../../types';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_TONE: Record<StoreOrderStatus, 'green' | 'blue' | 'slate' | 'red'> = {
  PAID: 'blue',
  FULFILLED: 'green',
  PENDING: 'slate',
  CANCELED: 'red'
};

function formatAddress(address: Record<string, unknown> | null) {
  if (!address) return null;
  const parts = [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export function StoreOrdersTable() {
  const [orders, setOrders] = useState<AdminStoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await api<AdminStoreOrdersPage>(`/api/admin/store/orders?page=${nextPage}&pageSize=50`);
      setOrders(result.orders);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(1));
  }, [load]);

  async function fulfill(order: AdminStoreOrder) {
    setBusyId(order.id);
    setError('');
    try {
      const updated = await api<AdminStoreOrder>(`/api/admin/store/orders/${order.id}/fulfill`, { method: 'POST' });
      setOrders((current) => current.map((row) => (row.id === order.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark fulfilled.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Card><p className="text-sm text-app-text-muted">Loading orders…</p></Card>;

  return (
    <Card>
      <h2 className="text-lg font-bold text-app-text">Orders</h2>
      <p className="mt-0.5 text-sm text-app-text-muted">
        Paid orders awaiting fulfillment, and fulfilled history · {total} order{total === 1 ? '' : 's'}.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-app-text-muted">No paid orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => {
            const address = formatAddress(order.shippingAddress);
            return (
              <li key={order.id} className="rounded-2xl border border-app-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-app-text">
                        {order.customer.firstName} {order.customer.lastName}
                      </span>
                      <Badge tone={STATUS_TONE[order.status]}>{order.status.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-app-text-muted">{order.customer.email}</p>
                    <p className="mt-2 text-sm text-app-text">
                      {order.items.map((item) => `${item.quantity} × ${item.nameSnapshot}`).join(' · ')}
                    </p>
                    {(order.shippingName || address) && (
                      <p className="mt-1 text-xs text-app-text-muted">
                        Ship to: {order.shippingName ?? '—'}
                        {address ? ` · ${address}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-app-text">{formatCents(order.totalCents)}</p>
                    <p className="mt-0.5 text-xs text-app-text-muted">{formatDate(order.paidAt ?? order.createdAt)}</p>
                    {order.status === 'PAID' && (
                      <Button
                        className="mt-2"
                        disabled={busyId === order.id}
                        onClick={() => void fulfill(order)}
                      >
                        {busyId === order.id ? 'Marking…' : 'Mark fulfilled'}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
          <p className="text-sm text-app-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={loading || page >= totalPages}
              onClick={() => void load(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
