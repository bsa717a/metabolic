import type Stripe from 'stripe';
import { StoreOrderStatus, type User } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { getStripe } from './stripeClient.js';
import { getCart } from './storeService.js';
import { getStoreOrderNotificationEmail } from './appSettings.js';
import { sendStoreOrderNotificationEmail } from './emailService.js';

export class StoreCheckoutError extends Error {}

async function supersedePendingCheckouts(userId: string) {
  const pendingOrders = await prisma.storeOrder.findMany({
    where: { userId, status: StoreOrderStatus.PENDING },
    select: { id: true, stripeCheckoutSessionId: true }
  });

  for (const pending of pendingOrders) {
    if (!pending.stripeCheckoutSessionId) {
      await prisma.storeOrder.updateMany({
        where: { id: pending.id, status: StoreOrderStatus.PENDING },
        data: { status: StoreOrderStatus.CANCELED }
      });
      continue;
    }

    const stripe = getStripe();
    let session = await stripe.checkout.sessions.retrieve(pending.stripeCheckoutSessionId);
    if (session.payment_status === 'paid') {
      await finalizePaidSession(session);
      throw new StoreCheckoutError('Your previous checkout already completed. Your cart has been updated.');
    }
    if (session.status === 'complete') {
      throw new StoreCheckoutError('Your previous checkout payment is still processing. Please wait before trying again.');
    }

    if (session.status === 'open') {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // Payment may have completed between retrieve and expire. Never cancel the DB
        // order until Stripe confirms the old session can no longer accept payment.
        session = await stripe.checkout.sessions.retrieve(session.id);
        if (session.payment_status === 'paid') await finalizePaidSession(session);
        throw new StoreCheckoutError(
          session.payment_status === 'paid'
            ? 'Your previous checkout already completed. Your cart has been updated.'
            : 'Your previous checkout could not be closed. Please wait and try again.'
        );
      }
    }

    await prisma.storeOrder.updateMany({
      where: { id: pending.id, status: StoreOrderStatus.PENDING },
      data: { status: StoreOrderStatus.CANCELED }
    });
  }
}

/**
 * Creates a PENDING order snapshot for the user's cart and a Stripe Checkout Session for it.
 * Totals and prices come from the DB — client-sent amounts are never trusted.
 */
export async function createCheckoutSession(user: Pick<User, 'id' | 'email'>): Promise<{ url: string }> {
  await supersedePendingCheckouts(user.id);

  const cart = await getCart(user.id);
  if (!cart.items.length) throw new StoreCheckoutError('Your cart is empty.');

  const order = await prisma.storeOrder.create({
    data: {
      userId: user.id,
      status: StoreOrderStatus.PENDING,
      totalCents: cart.totalCents,
      items: {
        create: cart.items.map((item) => ({
          productId: item.productId,
          nameSnapshot: item.name,
          priceCentsSnapshot: item.priceCents,
          quantity: item.quantity
        }))
      }
    }
  });

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: cart.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: 'usd',
        unit_amount: item.priceCents,
        product_data: {
          name: item.name,
          ...(item.imageUrl ? { images: [item.imageUrl] } : {})
        }
      }
    })),
    shipping_address_collection: { allowed_countries: ['US'] },
    success_url: `${env.CLIENT_URL}/store?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/store?checkout=cancel`,
    metadata: { orderId: order.id, userId: user.id }
  });

  if (!session.url) throw new StoreCheckoutError('Stripe did not return a checkout URL.');

  await prisma.storeOrder.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id }
  });

  return { url: session.url };
}

function extractShipping(session: Stripe.Checkout.Session) {
  // API 2024-10+ moved shipping to collected_information; keep the legacy field as fallback.
  const shipping =
    session.collected_information?.shipping_details ??
    (session as unknown as { shipping_details?: { name?: string | null; address?: Record<string, unknown> } })
      .shipping_details;
  return {
    shippingName: shipping?.name ?? session.customer_details?.name ?? null,
    shippingAddress: shipping?.address ? JSON.parse(JSON.stringify(shipping.address)) : null
  };
}

/**
 * Marks the session's order PAID and completes post-payment work. Each DB side effect
 * has its own completion marker so a webhook retry resumes after the last successful step.
 */
export async function finalizePaidSession(session: Stripe.Checkout.Session): Promise<{ finalized: boolean }> {
  if (session.payment_status !== 'paid') return { finalized: false };

  const { shippingName, shippingAddress } = extractShipping(session);
  await prisma.storeOrder.updateMany({
    where: {
      stripeCheckoutSessionId: session.id,
      status: { in: [StoreOrderStatus.PENDING, StoreOrderStatus.CANCELED] }
    },
    data: {
      status: StoreOrderStatus.PAID,
      paidAt: new Date(),
      shippingName,
      shippingAddress: shippingAddress ?? undefined
    }
  });

  const order = await prisma.storeOrder.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    include: { items: true, user: { select: { email: true, firstName: true, lastName: true } } }
  });
  if (!order || order.status !== StoreOrderStatus.PAID) return { finalized: false };

  if (!order.cartClearedAt) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.storeOrder.updateMany({
        where: { id: order.id, status: StoreOrderStatus.PAID, cartClearedAt: null },
        data: { cartClearedAt: new Date() }
      });
      if (claimed.count > 0) await tx.storeCartItem.deleteMany({ where: { userId: order.userId } });
    });
  }

  if (!order.notificationSentAt) {
    const recipient = (await getStoreOrderNotificationEmail(prisma)) ?? (env.STORE_NOTIFY_EMAIL || null);
    if (recipient) {
      await sendStoreOrderNotificationEmail({
        to: recipient,
        orderId: order.id,
        totalCents: order.totalCents,
        customerName: `${order.user.firstName} ${order.user.lastName}`.trim(),
        customerEmail: order.user.email,
        shippingName: order.shippingName,
        items: order.items.map((item) => ({
          name: item.nameSnapshot,
          quantity: item.quantity,
          priceCents: item.priceCentsSnapshot
        }))
      });
    }
    await prisma.storeOrder.updateMany({
      where: { id: order.id, status: StoreOrderStatus.PAID, notificationSentAt: null },
      data: { notificationSentAt: new Date() }
    });
  }

  return { finalized: true };
}

/** Marks the PENDING order for an expired checkout session CANCELED. */
export async function cancelPendingOrderForSession(sessionId: string) {
  await prisma.storeOrder.updateMany({
    where: { stripeCheckoutSessionId: sessionId, status: StoreOrderStatus.PENDING },
    data: { status: StoreOrderStatus.CANCELED }
  });
}

/**
 * Redirect-side fallback for the webhook race (and the only finalizer in local dev
 * without `stripe listen`): fetch the session, verify ownership, finalize if paid.
 */
export async function confirmCheckoutSession(userId: string, sessionId: string) {
  const order = await prisma.storeOrder.findUnique({ where: { stripeCheckoutSessionId: sessionId } });
  if (!order || order.userId !== userId) throw new StoreCheckoutError('Order not found.');

  if (order.status === StoreOrderStatus.PAID) {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    await finalizePaidSession(session);
    return { status: 'paid' as const };
  }
  if (order.status !== StoreOrderStatus.PENDING) return { status: 'canceled' as const };

  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const { finalized } = await finalizePaidSession(session);
  return { status: finalized ? ('paid' as const) : ('processing' as const) };
}
