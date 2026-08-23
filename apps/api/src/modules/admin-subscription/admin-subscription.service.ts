import type {
  AdminSubscription,
  AdminSubscriptionListResponse,
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  GrantPlanAccessInput,
  ListAdminSubscriptionsQuery,
  RenewSubscriptionInput,
  UpdateSubscriptionInput,
} from '@momentum/types';
import type { PlanInterval, Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  addBillingPeriod,
  LIVE_SUB_STATUSES,
  pageCount,
  PAY_METHOD_TO_DB,
  PAY_STATUS_TO_DB,
  skipTake,
  SUB_TO_DB,
  toAdminSubscription,
} from '../admin/mappers.js';

const subscriptionInclude = {
  user: { select: { id: true, name: true, email: true } },
  plan: {
    select: {
      id: true,
      slug: true,
      name: true,
      priceCents: true,
      currency: true,
      interval: true,
      intervalCount: true,
    },
  },
} satisfies Prisma.PlanSubscriptionInclude;

async function requireSubscription(id: string) {
  const row = await prisma.planSubscription.findUnique({
    where: { id },
    include: subscriptionInclude,
  });
  if (!row) throw AppError.notFound('Subscription not found');
  return row;
}

async function requireLiveUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw AppError.notFound('User not found');
  return user;
}

async function requirePlan(planId: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      status: true,
      priceCents: true,
      currency: true,
      interval: true,
      intervalCount: true,
    },
  });
  if (!plan) throw AppError.notFound('Plan not found');
  if (plan.status === 'ARCHIVED') {
    throw AppError.conflict('Archived plans cannot be assigned');
  }
  return plan;
}

async function cancelLiveSubscriptions(userId: string, exceptId?: string): Promise<void> {
  await prisma.planSubscription.updateMany({
    where: {
      userId,
      status: { in: LIVE_SUB_STATUSES },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { status: 'CANCELED', canceledAt: new Date() },
  });
}

function periodFor(
  interval: PlanInterval,
  intervalCount: number,
  start = new Date(),
  explicitEnd?: Date | null,
): { currentPeriodStart: Date; currentPeriodEnd: Date | null } {
  return {
    currentPeriodStart: start,
    currentPeriodEnd:
      explicitEnd === undefined ? addBillingPeriod(start, interval, intervalCount) : explicitEnd,
  };
}

export async function listSubscriptions(
  query: ListAdminSubscriptionsQuery,
): Promise<AdminSubscriptionListResponse> {
  const where: Prisma.PlanSubscriptionWhereInput = {};
  if (query.status) where.status = SUB_TO_DB[query.status];
  if (query.planId) where.planId = query.planId;
  if (query.userId) where.userId = query.userId;
  if (query.q) {
    where.user = {
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ],
    };
  }

  const { skip, take } = skipTake(query.page, query.limit);
  const [rows, total] = await prisma.$transaction([
    prisma.planSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: subscriptionInclude,
    }),
    prisma.planSubscription.count({ where }),
  ]);

  return {
    subscriptions: rows.map(toAdminSubscription),
    page: query.page,
    limit: query.limit,
    total,
    pageCount: pageCount(total, query.limit),
  };
}

export async function getSubscription(id: string): Promise<AdminSubscription> {
  return toAdminSubscription(await requireSubscription(id));
}

export async function createSubscription(
  actorId: string,
  input: CreateSubscriptionInput,
): Promise<AdminSubscription> {
  await requireLiveUser(input.userId);
  const plan = await requirePlan(input.planId);
  const status = SUB_TO_DB[input.status];
  const start = input.currentPeriodStart ? new Date(input.currentPeriodStart) : new Date();
  const period = periodFor(
    plan.interval,
    plan.intervalCount,
    start,
    input.currentPeriodEnd === undefined
      ? undefined
      : input.currentPeriodEnd === null
        ? null
        : new Date(input.currentPeriodEnd),
  );

  const created = await prisma.$transaction(async (tx) => {
    if (LIVE_SUB_STATUSES.includes(status)) {
      await tx.planSubscription.updateMany({
        where: { userId: input.userId, status: { in: LIVE_SUB_STATUSES } },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    }

    const subscription = await tx.planSubscription.create({
      data: {
        userId: input.userId,
        planId: input.planId,
        status,
        seats: input.seats,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        ...(input.trialEndsAt !== undefined
          ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: subscriptionInclude,
    });

    if (input.payment) {
      await tx.payment.create({
        data: {
          userId: input.userId,
          planId: input.planId,
          subscriptionId: subscription.id,
          amountCents: input.payment.amountCents ?? plan.priceCents * input.seats,
          currency: input.payment.currency ?? plan.currency,
          status: PAY_STATUS_TO_DB[input.payment.status],
          method: PAY_METHOD_TO_DB[input.payment.method],
          ...(input.payment.paidAt ? { paidAt: new Date(input.payment.paidAt) } : {}),
          ...(input.payment.description !== undefined
            ? { description: input.payment.description }
            : { description: `Subscription to ${subscription.plan.name}` }),
          recordedById: actorId,
        },
      });
    }

    return subscription;
  });

  return toAdminSubscription(created);
}

export async function updateSubscription(
  id: string,
  input: UpdateSubscriptionInput,
): Promise<AdminSubscription> {
  const existing = await requireSubscription(id);

  if (input.planId && input.planId !== existing.planId) {
    await requirePlan(input.planId);
  }

  const nextStatus = input.status ? SUB_TO_DB[input.status] : existing.status;
  if (LIVE_SUB_STATUSES.includes(nextStatus)) {
    await cancelLiveSubscriptions(existing.userId, existing.id);
  }

  const updated = await prisma.planSubscription.update({
    where: { id },
    data: {
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
      ...(input.status !== undefined ? { status: SUB_TO_DB[input.status] } : {}),
      ...(input.seats !== undefined ? { seats: input.seats } : {}),
      ...(input.currentPeriodStart !== undefined
        ? { currentPeriodStart: new Date(input.currentPeriodStart) }
        : {}),
      ...(input.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null }
        : {}),
      ...(input.trialEndsAt !== undefined
        ? { trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status === 'canceled' && !existing.canceledAt ? { canceledAt: new Date() } : {}),
      ...(input.status && input.status !== 'canceled' ? { canceledAt: null } : {}),
    },
    include: subscriptionInclude,
  });

  return toAdminSubscription(updated);
}

export async function cancelSubscription(
  id: string,
  input: CancelSubscriptionInput,
): Promise<AdminSubscription> {
  const existing = await requireSubscription(id);
  if (existing.status === 'CANCELED' || existing.status === 'EXPIRED') {
    throw AppError.conflict('Subscription is already ended');
  }

  const updated = await prisma.planSubscription.update({
    where: { id },
    data: {
      status: input.atPeriodEnd ? existing.status : 'CANCELED',
      canceledAt: new Date(),
      ...(input.atPeriodEnd ? {} : { currentPeriodEnd: existing.currentPeriodEnd ?? new Date() }),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: subscriptionInclude,
  });

  return toAdminSubscription(updated);
}

export async function renewSubscription(
  actorId: string,
  id: string,
  input: RenewSubscriptionInput,
): Promise<AdminSubscription> {
  const existing = await requireSubscription(id);
  if (existing.status === 'CANCELED' || existing.status === 'EXPIRED') {
    throw AppError.conflict(
      'Canceled or expired subscriptions cannot be renewed — assign a new plan',
    );
  }

  const now = new Date();
  const base =
    existing.currentPeriodEnd && existing.currentPeriodEnd.getTime() > now.getTime()
      ? existing.currentPeriodEnd
      : now;
  const nextEnd = addBillingPeriod(base, existing.plan.interval, existing.plan.intervalCount);

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = await tx.planSubscription.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        canceledAt: null,
        currentPeriodStart: base,
        currentPeriodEnd: nextEnd,
      },
      include: subscriptionInclude,
    });

    if (input.payment) {
      await tx.payment.create({
        data: {
          userId: existing.userId,
          planId: existing.planId,
          subscriptionId: existing.id,
          amountCents: input.payment.amountCents ?? existing.plan.priceCents * existing.seats,
          currency: input.payment.currency ?? existing.plan.currency,
          status: PAY_STATUS_TO_DB[input.payment.status],
          method: PAY_METHOD_TO_DB[input.payment.method],
          ...(input.payment.paidAt ? { paidAt: new Date(input.payment.paidAt) } : {}),
          ...(input.payment.description !== undefined
            ? { description: input.payment.description }
            : { description: `Renewal of ${existing.plan.name}` }),
          recordedById: actorId,
        },
      });
    }

    return subscription;
  });

  return toAdminSubscription(updated);
}

export async function grantComplimentaryAccess(
  actorId: string,
  userId: string,
  input: GrantPlanAccessInput,
): Promise<AdminSubscription> {
  const plan = await prisma.plan.findFirst({
    where: { slug: input.planSlug, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!plan) throw AppError.notFound(`Plan "${input.planSlug}" not found`);

  const start = new Date();
  let currentPeriodEnd: string | null;
  if (input.accessType === 'lifetime') {
    currentPeriodEnd = null;
  } else {
    const end = new Date(start);
    end.setDate(end.getDate() + (input.days ?? 365));
    currentPeriodEnd = end.toISOString();
  }

  const notePrefix =
    input.accessType === 'lifetime'
      ? 'Complimentary lifetime Pro access'
      : `Complimentary Pro access for ${input.days ?? 365} days`;

  return createSubscription(actorId, {
    userId,
    planId: plan.id,
    status: 'active',
    seats: 1,
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd,
    notes: input.notes ? `${notePrefix}. ${input.notes}` : notePrefix,
  });
}
