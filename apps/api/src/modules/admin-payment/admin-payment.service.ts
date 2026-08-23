import type {
  AdminPayment,
  AdminPaymentListResponse,
  CreatePaymentInput,
  ListAdminPaymentsQuery,
  RefundPaymentInput,
  RevenueBreakdownRow,
  RevenueQuery,
  RevenueResponse,
  RevenueSeriesPoint,
  UpdatePaymentInput,
} from '@momentum/types';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  addUtcDays,
  pageCount,
  PAY_METHOD_FROM_DB,
  PAY_METHOD_TO_DB,
  PAY_STATUS_TO_DB,
  periodKey,
  skipTake,
  toAdminPayment,
  utcDayEnd,
  utcDayStart,
} from '../admin/mappers.js';
import {
  notifyAdminsNewPayment,
  notifyPaymentRefunded,
  notifyPaymentSucceeded,
} from '../notification/notification.events.js';

const paymentInclude = {
  user: { select: { id: true, name: true, email: true } },
  plan: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PaymentInclude;

async function requirePayment(id: string) {
  const row = await prisma.payment.findUnique({
    where: { id },
    include: paymentInclude,
  });
  if (!row) throw AppError.notFound('Payment not found');
  return row;
}

function paymentWhere(query: ListAdminPaymentsQuery): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = {};
  if (query.status) where.status = PAY_STATUS_TO_DB[query.status];
  if (query.method) where.method = PAY_METHOD_TO_DB[query.method];
  if (query.userId) where.userId = query.userId;
  if (query.planId) where.planId = query.planId;
  if (query.subscriptionId) where.subscriptionId = query.subscriptionId;
  if (query.currency) where.currency = query.currency;
  if (query.from || query.to) {
    where.paidAt = {
      ...(query.from ? { gte: utcDayStart(query.from) } : {}),
      ...(query.to ? { lte: utcDayEnd(query.to) } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { user: { name: { contains: query.q, mode: 'insensitive' } } },
      { user: { email: { contains: query.q, mode: 'insensitive' } } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { providerRef: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listPayments(
  query: ListAdminPaymentsQuery,
): Promise<AdminPaymentListResponse> {
  const where = paymentWhere(query);
  const { skip, take } = skipTake(query.page, query.limit);
  const [rows, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip,
      take,
      include: paymentInclude,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    payments: rows.map(toAdminPayment),
    page: query.page,
    limit: query.limit,
    total,
    pageCount: pageCount(total, query.limit),
  };
}

export async function getPayment(id: string): Promise<AdminPayment> {
  return toAdminPayment(await requirePayment(id));
}

export async function createPayment(
  actorId: string,
  input: CreatePaymentInput,
): Promise<AdminPayment> {
  let userId = input.userId;
  let planId = input.planId ?? null;
  const subscriptionId = input.subscriptionId ?? null;

  if (subscriptionId) {
    const subscription = await prisma.planSubscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, planId: true },
    });
    if (!subscription) throw AppError.notFound('Subscription not found');
    if (userId && userId !== subscription.userId) {
      throw AppError.validation('Check the highlighted fields', [
        { field: 'userId', issue: 'does not match the subscription owner' },
      ]);
    }
    userId = subscription.userId;
    planId = planId ?? subscription.planId;
  }

  if (!userId) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'userId', issue: 'is required' },
    ]);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw AppError.notFound('User not found');

  if (planId) {
    const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) throw AppError.notFound('Plan not found');
  }

  const created = await prisma.payment.create({
    data: {
      userId,
      planId,
      subscriptionId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: PAY_STATUS_TO_DB[input.status],
      method: PAY_METHOD_TO_DB[input.method],
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.providerRef !== undefined ? { providerRef: input.providerRef } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.paidAt ? { paidAt: new Date(input.paidAt) } : {}),
      ...(input.status === 'refunded' ? { refundedAt: new Date() } : {}),
      recordedById: actorId,
    },
    include: paymentInclude,
  });

  const payment = toAdminPayment(created);
  if (input.status === 'succeeded') {
    notifyPaymentSucceeded(created.userId, {
      amountCents: created.amountCents,
      currency: created.currency,
      planName: created.plan?.name ?? 'plan',
    });
    notifyAdminsNewPayment({
      userId: created.userId,
      amountCents: created.amountCents,
      currency: created.currency,
      planName: created.plan?.name ?? 'plan',
    });
  }

  return payment;
}

export async function updatePayment(id: string, input: UpdatePaymentInput): Promise<AdminPayment> {
  const existing = await requirePayment(id);
  if (existing.status !== 'PENDING') {
    throw AppError.conflict('Only pending payments can be updated');
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: PAY_STATUS_TO_DB[input.status] } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.providerRef !== undefined ? { providerRef: input.providerRef } : {}),
    },
    include: paymentInclude,
  });

  return toAdminPayment(updated);
}

export async function refundPayment(id: string, input: RefundPaymentInput): Promise<AdminPayment> {
  const existing = await requirePayment(id);
  if (existing.status !== 'SUCCEEDED') {
    throw AppError.conflict('Only succeeded payments can be refunded');
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      status: 'REFUNDED',
      refundedAt: new Date(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: paymentInclude,
  });

  notifyPaymentRefunded(updated.userId, {
    amountCents: updated.amountCents,
    currency: updated.currency,
  });

  return toAdminPayment(updated);
}

function emptyBreakdown(): Pick<
  RevenueBreakdownRow,
  'grossCents' | 'refundedCents' | 'netCents' | 'paymentCount'
> {
  return { grossCents: 0, refundedCents: 0, netCents: 0, paymentCount: 0 };
}

function applyPayment(
  bucket: { grossCents: number; refundedCents: number; netCents: number; paymentCount: number },
  amountCents: number,
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED',
): void {
  if (status === 'SUCCEEDED') {
    bucket.grossCents += amountCents;
    bucket.netCents += amountCents;
    bucket.paymentCount += 1;
  } else if (status === 'REFUNDED') {
    bucket.grossCents += amountCents;
    bucket.refundedCents += amountCents;
    bucket.paymentCount += 1;
  }
}

export async function getRevenue(query: RevenueQuery): Promise<RevenueResponse> {
  const to = query.to ?? new Date().toISOString().slice(0, 10);
  const from = query.from ?? addUtcDays(utcDayStart(to), -29).toISOString().slice(0, 10);
  if (from > to) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'from', issue: 'must be on or before to' },
    ]);
  }

  const where: Prisma.PaymentWhereInput = {
    paidAt: { gte: utcDayStart(from), lte: utcDayEnd(to) },
    status: query.status ? PAY_STATUS_TO_DB[query.status] : { in: ['SUCCEEDED', 'REFUNDED'] },
  };
  if (query.currency) where.currency = query.currency;
  if (query.planId) where.planId = query.planId;
  if (query.method) where.method = PAY_METHOD_TO_DB[query.method];

  const rows = await prisma.payment.findMany({
    where,
    select: {
      amountCents: true,
      status: true,
      method: true,
      paidAt: true,
      planId: true,
      plan: { select: { slug: true, name: true } },
    },
  });

  const totals = emptyBreakdown();
  const seriesMap = new Map<string, RevenueSeriesPoint>();
  const planMap = new Map<string, RevenueBreakdownRow>();
  const methodMap = new Map<string, RevenueBreakdownRow>();
  const statusMap = new Map<string, RevenueBreakdownRow>();

  for (const row of rows) {
    applyPayment(totals, row.amountCents, row.status);

    const period = periodKey(row.paidAt, query.groupBy);
    let series = seriesMap.get(period);
    if (!series) {
      series = { period, ...emptyBreakdown() };
      seriesMap.set(period, series);
    }
    applyPayment(series, row.amountCents, row.status);

    const planKey = row.plan?.slug ?? 'none';
    let planRow = planMap.get(planKey);
    if (!planRow) {
      planRow = {
        key: planKey,
        label: row.plan?.name ?? 'No plan',
        ...emptyBreakdown(),
      };
      planMap.set(planKey, planRow);
    }
    applyPayment(planRow, row.amountCents, row.status);

    const methodKey = PAY_METHOD_FROM_DB[row.method];
    let methodRow = methodMap.get(methodKey);
    if (!methodRow) {
      methodRow = { key: methodKey, label: methodKey, ...emptyBreakdown() };
      methodMap.set(methodKey, methodRow);
    }
    applyPayment(methodRow, row.amountCents, row.status);

    const statusKey = row.status.toLowerCase();
    let statusRow = statusMap.get(statusKey);
    if (!statusRow) {
      statusRow = { key: statusKey, label: statusKey, ...emptyBreakdown() };
      statusMap.set(statusKey, statusRow);
    }
    applyPayment(statusRow, row.amountCents, row.status);
  }

  const chargedCount = totals.paymentCount;
  return {
    from,
    to,
    groupBy: query.groupBy,
    currency: query.currency ?? null,
    totals: {
      ...totals,
      refundCount: rows.filter((row) => row.status === 'REFUNDED').length,
      averageCents: chargedCount === 0 ? 0 : Math.round(totals.grossCents / chargedCount),
    },
    series: [...seriesMap.values()].sort((a, b) => a.period.localeCompare(b.period)),
    byPlan: [...planMap.values()].sort((a, b) => b.netCents - a.netCents),
    byMethod: [...methodMap.values()].sort((a, b) => b.netCents - a.netCents),
    byStatus: [...statusMap.values()].sort((a, b) => b.paymentCount - a.paymentCount),
  };
}
