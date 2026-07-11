import { Prisma, StoreOrderStatus, StoreProductCategory } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export class StoreAdminError extends Error {}

const ORDER_INCLUDE = {
  items: true,
  user: { select: { firstName: true, lastName: true, email: true } }
} satisfies Prisma.StoreOrderInclude;

type AdminOrderRow = Prisma.StoreOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export function serializeAdminOrder(order: AdminOrderRow) {
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    customer: {
      firstName: order.user.firstName,
      lastName: order.user.lastName,
      email: order.user.email
    },
    shippingName: order.shippingName,
    shippingAddress: order.shippingAddress ?? null,
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      priceCentsSnapshot: item.priceCentsSnapshot,
      quantity: item.quantity
    })),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

export function serializeAdminProduct(product: {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  category: StoreProductCategory;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    category: product.category,
    priceCents: product.priceCents,
    currency: product.currency,
    active: product.active,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

export async function listAllProducts() {
  const products = await prisma.storeProduct.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]
  });
  return products.map(serializeAdminProduct);
}

export type ProductCreateInput = {
  name: string;
  description: string;
  category: StoreProductCategory;
  priceCents: number;
  imageUrl?: string | null;
  active?: boolean;
};

export async function createProduct(input: ProductCreateInput) {
  const max = await prisma.storeProduct.aggregate({
    where: { category: input.category },
    _max: { sortOrder: true }
  });
  const product = await prisma.storeProduct.create({
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      priceCents: input.priceCents,
      imageUrl: input.imageUrl?.trim() || null,
      active: input.active ?? true,
      sortOrder: (max._max.sortOrder ?? 0) + 1
    }
  });
  return serializeAdminProduct(product);
}

export type ProductUpdateInput = Partial<ProductCreateInput> & { sortOrder?: number };

export async function updateProduct(id: string, input: ProductUpdateInput) {
  const product = await prisma.$transaction(async (tx) => {
    const existing = await tx.storeProduct.findUnique({ where: { id } });
    if (!existing) throw new StoreAdminError('Product not found.');

    let sortOrder = input.sortOrder;
    if (input.category && input.category !== existing.category && sortOrder === undefined) {
      const max = await tx.storeProduct.aggregate({
        where: { category: input.category },
        _max: { sortOrder: true }
      });
      sortOrder = (max._max.sortOrder ?? 0) + 1;
    }

    return tx.storeProduct.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl?.trim() || null,
        active: input.active,
        sortOrder
      }
    });
  });
  return serializeAdminProduct(product);
}

/** Swaps the product's sortOrder with its neighbor in the same category. */
export async function moveProduct(id: string, direction: 'up' | 'down') {
  const product = await prisma.storeProduct.findUnique({ where: { id } });
  if (!product) throw new StoreAdminError('Product not found.');

  const neighbor = await prisma.storeProduct.findFirst({
    where: {
      category: product.category,
      sortOrder: direction === 'up' ? { lt: product.sortOrder } : { gt: product.sortOrder }
    },
    orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' }
  });
  if (!neighbor) return { moved: false };

  await prisma.$transaction([
    prisma.storeProduct.update({ where: { id: product.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.storeProduct.update({ where: { id: neighbor.id }, data: { sortOrder: product.sortOrder } })
  ]);
  return { moved: true };
}

export async function listAllOrders(
  statuses?: StoreOrderStatus[],
  options: { page?: number; pageSize?: number } = {}
) {
  const filter = statuses?.length ? statuses : [StoreOrderStatus.PAID, StoreOrderStatus.FULFILLED];
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const where = { status: { in: filter } };
  const [total, orders] = await prisma.$transaction([
    prisma.storeOrder.count({ where }),
    prisma.storeOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ORDER_INCLUDE
    })
  ]);
  return {
    orders: orders.map(serializeAdminOrder),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/** Transitions a PAID order to FULFILLED. Guarded so only paid orders can be fulfilled. */
export async function markOrderFulfilled(id: string) {
  const result = await prisma.storeOrder.updateMany({
    where: { id, status: StoreOrderStatus.PAID },
    data: { status: StoreOrderStatus.FULFILLED }
  });
  if (result.count === 0) {
    const order = await prisma.storeOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new StoreAdminError('Order not found.');
    if (order.status === StoreOrderStatus.FULFILLED) return serializeAdminOrder(order);
    throw new StoreAdminError(`Only paid orders can be fulfilled (this order is ${order.status.toLowerCase()}).`);
  }
  const order = await prisma.storeOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
  return serializeAdminOrder(order!);
}
