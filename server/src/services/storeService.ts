import { StoreOrderStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export const MAX_CART_ITEM_QUANTITY = 20;

export type StoreCartView = {
  items: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    priceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
  totalCents: number;
  itemCount: number;
};

export async function listProducts() {
  return prisma.storeProduct.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      category: true,
      priceCents: true,
      currency: true
    }
  });
}

export async function getCart(userId: string): Promise<StoreCartView> {
  const rows = await prisma.storeCartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: 'asc' }
  });

  // Items whose product was deactivated after being carted are dropped from view
  // (and rejected at checkout) rather than silently sold.
  const items = rows
    .filter((row) => row.product.active)
    .map((row) => ({
      productId: row.productId,
      name: row.product.name,
      imageUrl: row.product.imageUrl,
      priceCents: row.product.priceCents,
      quantity: row.quantity,
      lineTotalCents: row.product.priceCents * row.quantity
    }));

  return {
    items,
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
  };
}

export async function setCartItem(userId: string, productId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_CART_ITEM_QUANTITY) {
    throw new Error(`Quantity must be a whole number between 0 and ${MAX_CART_ITEM_QUANTITY}.`);
  }

  if (quantity === 0) {
    await prisma.storeCartItem.deleteMany({ where: { userId, productId } });
    return getCart(userId);
  }

  const product = await prisma.storeProduct.findFirst({ where: { id: productId, active: true } });
  if (!product) throw new Error('That product is no longer available.');

  await prisma.storeCartItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId, quantity },
    update: { quantity }
  });
  return getCart(userId);
}

export async function clearCart(userId: string) {
  await prisma.storeCartItem.deleteMany({ where: { userId } });
}

export async function listOrders(userId: string) {
  return prisma.storeOrder.findMany({
    where: { userId, status: { not: StoreOrderStatus.PENDING } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      totalCents: true,
      currency: true,
      paidAt: true,
      createdAt: true,
      items: {
        select: { nameSnapshot: true, priceCentsSnapshot: true, quantity: true }
      }
    }
  });
}
