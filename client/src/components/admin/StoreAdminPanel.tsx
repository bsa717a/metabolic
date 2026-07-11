import { useState } from 'react';
import { Button } from '../ui/Button';
import { StoreProductsTable } from './StoreProductsTable';
import { StoreOrdersTable } from './StoreOrdersTable';

type StoreTab = 'products' | 'orders';

export function StoreAdminPanel() {
  const [tab, setTab] = useState<StoreTab>('products');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === 'products' ? 'primary' : 'secondary'} onClick={() => setTab('products')}>
          Products
        </Button>
        <Button variant={tab === 'orders' ? 'primary' : 'secondary'} onClick={() => setTab('orders')}>
          Orders
        </Button>
      </div>
      {tab === 'products' ? <StoreProductsTable /> : <StoreOrdersTable />}
    </div>
  );
}
