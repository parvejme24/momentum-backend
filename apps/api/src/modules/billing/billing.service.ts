import type {
  BillingConfig,
  BillingPortalInput,
  CancelBillingInput,
  CheckoutInput,
  CheckoutResponse,
  ConfirmCheckoutInput,
  ConfirmCheckoutResponse,
  CustomerInvoice,
  CustomerSubscription,
} from '@momentum/types';
import type { PlanInterval, Prisma } from '../../generated/prisma/client.js';
import { resolveUserEntitlements } from '../../lib/entitlements.js';
import { env } from '../../lib/env.js';
import { corsOrigins } from '../../lib/cors-origins.js';
import { AppError } from '../../lib/errors.js';
import { isPurchasablePlanSlug } from '../../lib/plan-catalog.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  isStripeConfigured,
  requireStripe,
  stripePublishableKey,
  stripeWebhookSecret,
} from '../../lib/stripe.js';
import { getSslCommerzPublicConfig } from '../../lib/sslcommerz.js';
import {
  confirmSslCommerzCheckout,
  startSslCommerzCheckout,
} from './billing-sslcommerz.service.js';
import {
  addBillingPeriod,
  INTERVAL_FROM_DB,
  LIVE_SUB_STATUSES,
  SUB_FROM_DB,
} from '../admin/mappers.js';
import {
  notifyAdminsNewPayment,
  notifyAdminsSubscriptionCanceled,
  notifyPaymentFailed,
  notifyPaymentSucceeded,
  notifySubscriptionCanceled,
  notifySubscriptionPastDue,
  notifySubscriptionRenewed,
  notifySubscriptionStarted,
} from '../notification/notification.events.js';

const customerSubInclude = {
  plan: {
    include: { features: { orderBy: { sortOrder: 'asc' as const } } },
  },
} satisfies Prisma.PlanSubscriptionInclude;

type SubWithPlan = Prisma.PlanSubscriptionGetPayload<{ include: typeof customerSubInclude }>;

export type CheckoutFulfillment = {
  sessionId: string;
  provider: 'stripe' | 'sslcommerz';
  customerId?: string | null;
  stripeSubscriptionId?: string | null;
  amountCents: number;
  currency: string;
  userId: string;
  planId: string;
  seats: number;
  receiptUrl?: string | null;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date | null;
  paymentMethod?: 'CARD' | 'OTHER';
  valId?: string;
};

export function toCustomerSubscriptionFromRow(row: SubWithPlan): CustomerSubscription {
  return toCustomerSubscription(row);
}

function toCustomerSubscription(row: SubWithPlan): CustomerSubscription {
  return {
    id: row.id,
    status: SUB_FROM_DB[row.status],
    seats: row.seats,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(row.canceledAt && LIVE_SUB_STATUSES.includes(row.status)),
    plan: {
      id: row.plan.id,
      slug: row.plan.slug,
      name: row.plan.name,
      priceCents: row.plan.priceCents,
      currency: row.plan.currency,
      interval: INTERVAL_FROM_DB[row.plan.interval],
      intervalCount: row.plan.intervalCount,
      features: row.plan.features.map((feature) => feature.label),
    },
  };
}

async function adminComplimentarySubscription(
  userId: string,
): Promise<CustomerSubscription | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'ADMIN', deletedAt: null, bannedAt: null },
    select: { id: true },
  });
  if (!user) return null;

  const plan = await prisma.plan.findFirst({
    where: { slug: 'pro-lifetime', status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!plan) return null;

  const now = new Date();
  return {
    id: `admin-complimentary-${userId}`,
    status: 'active',
    seats: 1,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    plan: {
      id: plan.id,
      slug: plan.slug,
      name: `${plan.name} (Admin)`,
      priceCents: 0,
      currency: plan.currency,
      interval: INTERVAL_FROM_DB[plan.interval],
      intervalCount: plan.intervalCount,
      features: [
        ...plan.features.map((feature) => feature.label),
        'Complimentary admin access — unlimited duration',
      ],
    },
  };
}

function assertRedirectUrl(url: string, field: string): void {
  const allowed = [...new Set([...corsOrigins(), env.APP_URL])];
  if (!allowed.some((origin) => url.startsWith(origin))) {
    throw AppError.validation('Check the highlighted fields', [
      { field, issue: 'must be on an allowed app origin' },
    ]);
  }
}

function isRecurring(interval: PlanInterval): interval is 'MONTH' | 'YEAR' {
  return interval === 'MONTH' || interval === 'YEAR';
}

async function requirePublishedPlan(planId: string) {
  const plan = await prisma.plan.findFirst({
    where: { id: planId, status: 'PUBLISHED' },
    include: { features: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!plan) throw AppError.notFound('Plan not found');
  if (plan.priceCents > 0 && !isPurchasablePlanSlug(plan.slug)) {
    throw AppError.validation('Check the highlighted fields', [
      {
        field: 'planId',
        issue: 'only pro-year and pro-lifetime plans can be purchased',
      },
    ]);
  }
  if (plan.priceCents === 0 && plan.slug !== 'free') {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'planId', issue: 'only the free plan can be activated without payment' },
    ]);
  }
  return plan;
}

async function requireLiveUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, bannedAt: null },
  });
  if (!user) throw AppError.unauthorized('User not found');
  return user;
}

async function findLiveSubscription(userId: string) {
  return prisma.planSubscription.findFirst({
    where: { userId, status: { in: LIVE_SUB_STATUSES } },
    include: customerSubInclude,
    orderBy: { createdAt: 'desc' },
  });
}

async function cancelRemoteSubscription(
  stripeSubscriptionId: string | null | undefined,
): Promise<void> {
  if (!stripeSubscriptionId || env.NODE_ENV === 'test') return;
  try {
    await requireStripe().subscriptions.cancel(stripeSubscriptionId);
  } catch (err) {
    logger.warn({ err, stripeSubscriptionId }, 'Could not cancel Stripe subscription');
  }
}

export function getConfig(): BillingConfig {
  const stripeConfigured = isStripeConfigured();
  const publishableKey = stripePublishableKey();
  const sslcommerz = getSslCommerzPublicConfig();

  return {
    publishableKey,
    configured: stripeConfigured || sslcommerz.configured,
    stripe: {
      publishableKey,
      configured: stripeConfigured,
    },
    sslcommerz: {
      configured: sslcommerz.configured,
      sandbox: sslcommerz.sandbox,
      successUrl: sslcommerz.successUrl,
      failUrl: sslcommerz.failUrl,
      cancelUrl: sslcommerz.cancelUrl,
    },
  };
}

export async function getMyEntitlements(userId: string) {
  const entitlements = await resolveUserEntitlements(userId);
  return { entitlements };
}

export async function getMySubscription(
  userId: string,
): Promise<{ subscription: CustomerSubscription | null }> {
  const live = await findLiveSubscription(userId);
  if (live) return { subscription: toCustomerSubscription(live) };

  const complimentary = await adminComplimentarySubscription(userId);
  if (complimentary) return { subscription: complimentary };

  const latest = await prisma.planSubscription.findFirst({
    where: { userId },
    include: customerSubInclude,
    orderBy: { createdAt: 'desc' },
  });
  return { subscription: latest ? toCustomerSubscription(latest) : null };
}

export async function listMyInvoices(userId: string): Promise<{ invoices: CustomerInvoice[] }> {
  const rows = await prisma.payment.findMany({
    where: {
      userId,
      amountCents: { gt: 0 },
      status: { in: ['SUCCEEDED', 'REFUNDED', 'PENDING'] },
    },
    orderBy: { paidAt: 'desc' },
    take: 50,
  });

  return {
    invoices: rows.map((row) => ({
      id: row.id,
      amountCents: row.amountCents,
      currency: row.currency,
      status:
        row.status === 'PENDING'
          ? 'pending'
          : row.status === 'SUCCEEDED'
            ? 'succeeded'
            : row.status === 'FAILED'
              ? 'failed'
              : 'refunded',
      paidAt: row.paidAt.toISOString(),
      description: row.description,
      receiptUrl: row.receiptUrl,
    })),
  };
}

export async function fulfillCheckout(input: CheckoutFulfillment): Promise<CustomerSubscription> {
  const provider = input.provider ?? 'stripe';

  const existingPayment = await prisma.payment.findFirst({
    where: { provider, providerRef: input.sessionId },
    select: { subscriptionId: true, status: true },
  });
  if (existingPayment?.subscriptionId && existingPayment.status === 'SUCCEEDED') {
    const existing = await prisma.planSubscription.findUnique({
      where: { id: existingPayment.subscriptionId },
      include: customerSubInclude,
    });
    if (existing) return toCustomerSubscription(existing);
  }

  const plan = await requirePublishedPlan(input.planId);
  await requireLiveUser(input.userId);

  const start = input.currentPeriodStart ?? new Date();
  const periodEnd =
    input.currentPeriodEnd === undefined
      ? addBillingPeriod(start, plan.interval, plan.intervalCount)
      : input.currentPeriodEnd;

  const subscription = await prisma.$transaction(async (tx) => {
    const live = await tx.planSubscription.findMany({
      where: { userId: input.userId, status: { in: LIVE_SUB_STATUSES } },
    });

    for (const row of live) {
      if (row.planId === plan.id) continue;
      await tx.planSubscription.update({
        where: { id: row.id },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    }

    const samePlan = live.find((row) => row.planId === plan.id);
    const next = samePlan
      ? await tx.planSubscription.update({
          where: { id: samePlan.id },
          data: {
            status: 'ACTIVE',
            seats: input.seats,
            currentPeriodStart: start,
            currentPeriodEnd: periodEnd,
            canceledAt: null,
            ...(input.stripeSubscriptionId
              ? { stripeSubscriptionId: input.stripeSubscriptionId }
              : {}),
          },
          include: customerSubInclude,
        })
      : await tx.planSubscription.create({
          data: {
            userId: input.userId,
            planId: plan.id,
            status: 'ACTIVE',
            seats: input.seats,
            currentPeriodStart: start,
            currentPeriodEnd: periodEnd,
            ...(input.stripeSubscriptionId
              ? { stripeSubscriptionId: input.stripeSubscriptionId }
              : {}),
          },
          include: customerSubInclude,
        });

    if (input.customerId) {
      await tx.user.update({
        where: { id: input.userId },
        data: { stripeCustomerId: input.customerId },
      });
    }

    const pendingPayment = await tx.payment.findFirst({
      where: {
        provider,
        providerRef: input.sessionId,
        userId: input.userId,
        status: 'PENDING',
      },
    });

    if (pendingPayment) {
      await tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          planId: plan.id,
          subscriptionId: next.id,
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
          status: 'SUCCEEDED',
          method: input.paymentMethod ?? (provider === 'stripe' ? 'CARD' : 'OTHER'),
          ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl } : {}),
          description:
            provider === 'sslcommerz'
              ? `SSLCommerz payment for ${plan.name}`
              : `Stripe payment for ${plan.name}`,
          paidAt: new Date(),
        },
      });
    } else {
      await tx.payment.create({
        data: {
          userId: input.userId,
          planId: plan.id,
          subscriptionId: next.id,
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
          status: 'SUCCEEDED',
          method: input.paymentMethod ?? (provider === 'stripe' ? 'CARD' : 'OTHER'),
          provider,
          providerRef: input.sessionId,
          ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl } : {}),
          description:
            provider === 'sslcommerz'
              ? `SSLCommerz payment for ${plan.name}`
              : `Stripe payment for ${plan.name}`,
        },
      });
    }

    return next;
  });

  for (const row of await prisma.planSubscription.findMany({
    where: {
      userId: input.userId,
      status: 'CANCELED',
      stripeSubscriptionId: { not: null },
      id: { not: subscription.id },
    },
    select: { stripeSubscriptionId: true },
  })) {
    await cancelRemoteSubscription(row.stripeSubscriptionId);
  }

  const customer = toCustomerSubscription(subscription);
  if (input.amountCents > 0) {
    notifyPaymentSucceeded(input.userId, {
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      planName: customer.plan.name,
    });
    notifyAdminsNewPayment({
      userId: input.userId,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      planName: customer.plan.name,
    });
  }
  notifySubscriptionStarted(input.userId, customer.plan.name);
  return customer;
}

async function ensureStripeCustomer(userId: string, email: string, name: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await requireStripe().customers.create({
    email,
    name,
    metadata: { userId },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function startCheckout(
  userId: string,
  input: CheckoutInput,
): Promise<CheckoutResponse> {
  const user = await requireLiveUser(userId);
  const plan = await requirePublishedPlan(input.planId);

  if (input.successUrl) assertRedirectUrl(input.successUrl, 'successUrl');
  if (input.cancelUrl) assertRedirectUrl(input.cancelUrl, 'cancelUrl');

  const live = await findLiveSubscription(userId);
  if (live && live.planId === plan.id && plan.priceCents > 0) {
    throw AppError.conflict('You are already on this plan');
  }

  if (plan.priceCents === 0) {
    if (live?.stripeSubscriptionId) {
      await cancelRemoteSubscription(live.stripeSubscriptionId);
    }
    const start = new Date();
    const created = await prisma.$transaction(async (tx) => {
      await tx.planSubscription.updateMany({
        where: { userId, status: { in: LIVE_SUB_STATUSES } },
        data: { status: 'CANCELED', canceledAt: start },
      });
      return tx.planSubscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'ACTIVE',
          seats: input.seats,
          currentPeriodStart: start,
          currentPeriodEnd: addBillingPeriod(start, plan.interval, plan.intervalCount),
        },
        include: customerSubInclude,
      });
    });

    notifySubscriptionStarted(userId, plan.name);

    return {
      provider: input.provider,
      url: null,
      sessionId: null,
      publishableKey: stripePublishableKey(),
      subscription: toCustomerSubscription(created),
    };
  }

  if (input.provider === 'sslcommerz') {
    return startSslCommerzCheckout(user, input, plan);
  }

  const customerId = await ensureStripeCustomer(userId, user.email, user.name);
  const recurring = isRecurring(plan.interval)
    ? {
        interval: plan.interval === 'MONTH' ? ('month' as const) : ('year' as const),
        interval_count: plan.intervalCount,
      }
    : undefined;

  const successUrl =
    input.successUrl ??
    `${env.APP_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${env.APP_URL}/subscription?checkout=cancel`;

  const session = await requireStripe().checkout.sessions.create({
    mode: recurring ? 'subscription' : 'payment',
    customer: customerId,
    client_reference_id: userId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      userId,
      planId: plan.id,
      seats: String(input.seats),
    },
    ...(recurring
      ? {
          subscription_data: {
            metadata: { userId, planId: plan.id, seats: String(input.seats) },
          },
        }
      : {}),
    line_items: [
      {
        quantity: input.seats,
        price_data: {
          currency: plan.currency.toLowerCase(),
          unit_amount: plan.priceCents,
          product_data: {
            name: plan.name,
            description: plan.blurb,
          },
          ...(recurring ? { recurring } : {}),
        },
      },
    ],
  });

  return {
    provider: 'stripe',
    url: session.url,
    sessionId: session.id,
    publishableKey: stripePublishableKey(),
    subscription: null,
  };
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }
  return null;
}

function invoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== 'object') return null;
  const row = invoice as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } };
  };
  return stripeId(row.subscription) ?? stripeId(row.parent?.subscription_details?.subscription);
}

export async function confirmCheckout(
  userId: string,
  input: ConfirmCheckoutInput,
): Promise<ConfirmCheckoutResponse> {
  if (input.provider === 'sslcommerz') {
    return confirmSslCommerzCheckout(userId, {
      tranId: input.tranId,
      ...(input.valId ? { valId: input.valId } : {}),
    });
  }

  const session = await requireStripe().checkout.sessions.retrieve(input.sessionId, {
    expand: ['subscription'],
  });

  const metadataUserId = session.metadata?.userId;
  if (metadataUserId !== userId) {
    throw AppError.forbidden('This checkout session belongs to another account');
  }
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    throw AppError.conflict('Checkout is not paid yet');
  }

  const planId = session.metadata?.planId;
  if (!planId) throw AppError.conflict('Checkout session is missing plan metadata');

  let periodStart: Date | undefined;
  let periodEnd: Date | null | undefined;
  const stripeSubscriptionId = stripeId(session.subscription);
  if (stripeSubscriptionId) {
    const sub = await requireStripe().subscriptions.retrieve(stripeSubscriptionId);
    const item = sub.items.data[0];
    if (item) {
      periodStart = new Date(item.current_period_start * 1000);
      periodEnd = new Date(item.current_period_end * 1000);
    }
  }

  const subscription = await fulfillCheckout({
    sessionId: session.id,
    provider: 'stripe',
    customerId: stripeId(session.customer),
    stripeSubscriptionId,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    userId,
    planId,
    seats: Number(session.metadata?.seats ?? '1') || 1,
    paymentMethod: 'CARD',
    ...(periodStart ? { currentPeriodStart: periodStart } : {}),
    ...(periodEnd !== undefined ? { currentPeriodEnd: periodEnd } : {}),
  });

  return {
    paymentStatus: 'succeeded',
    subscriptionStatus: 'active',
    subscription: { ...subscription, status: 'active' },
  };
}

export async function createPortalSession(
  userId: string,
  input: BillingPortalInput,
): Promise<{ url: string }> {
  const user = await requireLiveUser(userId);
  if (!user.stripeCustomerId) {
    throw AppError.conflict('No Stripe customer is linked to this account yet');
  }
  if (input.returnUrl) assertRedirectUrl(input.returnUrl, 'returnUrl');

  const session = await requireStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: input.returnUrl ?? `${env.APP_URL}/subscription`,
  });

  return { url: session.url };
}

export async function cancelMySubscription(
  userId: string,
  input: CancelBillingInput,
): Promise<{ subscription: CustomerSubscription }> {
  const live = await findLiveSubscription(userId);
  if (!live) throw AppError.notFound('No active subscription');
  if (live.plan.priceCents === 0) {
    throw AppError.conflict('The free plan cannot be cancelled');
  }

  if (live.stripeSubscriptionId && env.NODE_ENV !== 'test') {
    if (input.atPeriodEnd) {
      await requireStripe().subscriptions.update(live.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      await requireStripe().subscriptions.cancel(live.stripeSubscriptionId);
    }
  }

  const updated = await prisma.planSubscription.update({
    where: { id: live.id },
    data: input.atPeriodEnd
      ? { canceledAt: new Date() }
      : { status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: new Date() },
    include: customerSubInclude,
  });

  const customer = toCustomerSubscription(updated);
  notifySubscriptionCanceled(userId, customer.plan.name, input.atPeriodEnd);
  notifyAdminsSubscriptionCanceled({ userId, planName: customer.plan.name });
  return { subscription: customer };
}

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<void> {
  const secret = stripeWebhookSecret();
  if (!secret) {
    throw new AppError('Stripe webhook is not configured', 503, 'STRIPE_WEBHOOK_NOT_CONFIGURED');
  }
  if (!signature) {
    throw AppError.unauthorized('Missing Stripe signature');
  }

  const event = requireStripe().webhooks.constructEvent(rawBody, signature, secret);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (!userId || !planId || session.payment_status !== 'paid') return;

    await fulfillCheckout({
      sessionId: session.id,
      provider: 'stripe',
      customerId: stripeId(session.customer),
      stripeSubscriptionId: stripeId(session.subscription),
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      userId,
      planId,
      seats: Number(session.metadata?.seats ?? '1') || 1,
      paymentMethod: 'CARD',
    });
    return;
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const stripeSubscriptionId = invoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId || !invoice.id) return;

    const sub = await prisma.planSubscription.findUnique({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });
    if (!sub) return;

    const duplicate = await prisma.payment.findFirst({
      where: { provider: 'stripe', providerRef: invoice.id },
    });
    if (duplicate) return;

    const periodEnd = invoice.lines.data[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000)
      : addBillingPeriod(new Date(), sub.plan.interval, sub.plan.intervalCount);

    await prisma.$transaction([
      prisma.planSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          canceledAt: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      }),
      prisma.payment.create({
        data: {
          userId: sub.userId,
          planId: sub.planId,
          subscriptionId: sub.id,
          amountCents: invoice.amount_paid ?? sub.plan.priceCents,
          currency: (invoice.currency ?? sub.plan.currency).toUpperCase(),
          status: 'SUCCEEDED',
          method: 'CARD',
          provider: 'stripe',
          providerRef: invoice.id,
          ...(invoice.hosted_invoice_url ? { receiptUrl: invoice.hosted_invoice_url } : {}),
          description: `Stripe invoice for ${sub.plan.name}`,
        },
      }),
    ]);
    const amount = invoice.amount_paid ?? sub.plan.priceCents;
    const currency = (invoice.currency ?? sub.plan.currency).toUpperCase();
    notifyPaymentSucceeded(sub.userId, {
      amountCents: amount,
      currency,
      planName: sub.plan.name,
    });
    notifySubscriptionRenewed(sub.userId, sub.plan.name);
    notifyAdminsNewPayment({
      userId: sub.userId,
      amountCents: amount,
      currency,
      planName: sub.plan.name,
    });
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const stripeSubscriptionId = invoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return;
    await prisma.planSubscription.updateMany({
      where: { stripeSubscriptionId },
      data: { status: 'PAST_DUE' },
    });
    const pastDue = await prisma.planSubscription.findFirst({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });
    if (pastDue) {
      notifyPaymentFailed(pastDue.userId, { planName: pastDue.plan.name });
      notifySubscriptionPastDue(pastDue.userId, pastDue.plan.name);
    }
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const remote = event.data.object;
    const existing = await prisma.planSubscription.findFirst({
      where: { stripeSubscriptionId: remote.id },
      include: { plan: true },
    });
    await prisma.planSubscription.updateMany({
      where: { stripeSubscriptionId: remote.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    if (existing) {
      notifySubscriptionCanceled(existing.userId, existing.plan.name, false);
      notifyAdminsSubscriptionCanceled({
        userId: existing.userId,
        planName: existing.plan.name,
      });
    }
  }
}
