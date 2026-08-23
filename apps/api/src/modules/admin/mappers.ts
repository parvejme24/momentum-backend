import type {
  AdminPayment,
  AdminSubscription,
  AdminUser,
  AdminUserAccountStatus,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
} from '@momentum/types';
import type {
  PaymentMethod as DbPaymentMethod,
  PaymentStatus as DbPaymentStatus,
  PlanInterval as DbInterval,
  SubscriptionStatus as DbSubscriptionStatus,
} from '../../generated/prisma/client.js';

export const SUB_TO_DB: Record<SubscriptionStatus, DbSubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  expired: 'EXPIRED',
};

export const SUB_FROM_DB: Record<DbSubscriptionStatus, SubscriptionStatus> = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
};

export const PAY_STATUS_TO_DB: Record<PaymentStatus, DbPaymentStatus> = {
  pending: 'PENDING',
  succeeded: 'SUCCEEDED',
  failed: 'FAILED',
  refunded: 'REFUNDED',
};

export const PAY_STATUS_FROM_DB: Record<DbPaymentStatus, PaymentStatus> = {
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

export const PAY_METHOD_TO_DB: Record<PaymentMethod, DbPaymentMethod> = {
  card: 'CARD',
  bank_transfer: 'BANK_TRANSFER',
  cash: 'CASH',
  manual: 'MANUAL',
  other: 'OTHER',
};

export const PAY_METHOD_FROM_DB: Record<DbPaymentMethod, PaymentMethod> = {
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  MANUAL: 'manual',
  OTHER: 'other',
};

export const INTERVAL_FROM_DB: Record<DbInterval, AdminSubscription['plan']['interval']> = {
  ONE_TIME: 'one_time',
  MONTH: 'month',
  YEAR: 'year',
  FOREVER: 'forever',
};

export const LIVE_SUB_STATUSES: DbSubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export function accountStatus(user: {
  deletedAt: Date | null;
  bannedAt: Date | null;
}): AdminUserAccountStatus {
  if (user.deletedAt) return 'trashed';
  if (user.bannedAt) return 'banned';
  return 'active';
}

export function pageCount(total: number, limit: number): number {
  return total === 0 ? 0 : Math.ceil(total / limit);
}

export function skipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

type UserRef = { id: string; name: string; email: string };
type PlanRef = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: DbInterval;
  intervalCount: number;
};

export function toAdminUser(row: {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: 'ADMIN' | 'CUSTOMER';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastActiveAt: Date | null;
  bannedAt: Date | null;
  bannedReason: string | null;
  deletedAt: Date | null;
  _count: { habits: number };
  planSubscriptions: Array<{
    id: string;
    status: DbSubscriptionStatus;
    currentPeriodEnd: Date | null;
    plan: { id: string; slug: string; name: string };
  }>;
}): AdminUser {
  const subscription = row.planSubscriptions[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    role: row.role === 'ADMIN' ? 'admin' : 'customer',
    status: accountStatus(row),
    emailVerified: Boolean(row.emailVerifiedAt),
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    bannedAt: row.bannedAt?.toISOString() ?? null,
    bannedReason: row.bannedReason,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    habitCount: row._count.habits,
    plan: subscription
      ? {
          id: subscription.plan.id,
          slug: subscription.plan.slug,
          name: subscription.plan.name,
          status: SUB_FROM_DB[subscription.status],
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
  };
}

export function toAdminSubscription(row: {
  id: string;
  status: DbSubscriptionStatus;
  seats: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: UserRef;
  plan: PlanRef;
}): AdminSubscription {
  return {
    id: row.id,
    status: SUB_FROM_DB[row.status],
    seats: row.seats,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user: row.user,
    plan: {
      id: row.plan.id,
      slug: row.plan.slug,
      name: row.plan.name,
      priceCents: row.plan.priceCents,
      currency: row.plan.currency,
      interval: INTERVAL_FROM_DB[row.plan.interval],
      intervalCount: row.plan.intervalCount,
    },
  };
}

export function toAdminPayment(row: {
  id: string;
  amountCents: number;
  currency: string;
  status: DbPaymentStatus;
  method: DbPaymentMethod;
  provider: string | null;
  providerRef: string | null;
  description: string | null;
  notes: string | null;
  paidAt: Date;
  refundedAt: Date | null;
  createdAt: Date;
  subscriptionId: string | null;
  recordedById: string | null;
  user: UserRef;
  plan: { id: string; slug: string; name: string } | null;
}): AdminPayment {
  return {
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    status: PAY_STATUS_FROM_DB[row.status],
    method: PAY_METHOD_FROM_DB[row.method],
    provider: row.provider,
    providerRef: row.providerRef,
    description: row.description,
    notes: row.notes,
    paidAt: row.paidAt.toISOString(),
    refundedAt: row.refundedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
    plan: row.plan,
    subscriptionId: row.subscriptionId,
    recordedById: row.recordedById,
  };
}

export function addBillingPeriod(
  start: Date,
  interval: DbInterval,
  intervalCount: number,
): Date | null {
  if (interval === 'FOREVER' || interval === 'ONE_TIME') return null;
  const end = new Date(start.getTime());
  if (interval === 'MONTH') {
    end.setUTCMonth(end.getUTCMonth() + intervalCount);
  } else {
    end.setUTCFullYear(end.getUTCFullYear() + intervalCount);
  }
  return end;
}

export function utcDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function utcDayEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function periodKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (groupBy === 'day') return `${year}-${month}-${day}`;
  if (groupBy === 'month') return `${year}-${month}`;

  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - weekday);
  const isoYear = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
