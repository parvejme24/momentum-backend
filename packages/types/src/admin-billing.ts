import { z } from 'zod';
import type { AdminUser } from './admin-user.js';

export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'expired',
]);

export const paymentStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'refunded']);
export const paymentMethodSchema = z.enum(['card', 'bank_transfer', 'cash', 'manual', 'other']);
export const revenueGroupBySchema = z.enum(['day', 'week', 'month']);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO datetime' });

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code');

const notesSchema = z.string().trim().max(500);
const descriptionSchema = z.string().trim().max(280);

const optionalJsonBody = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? {} : value), schema);

export const adminIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listAdminSubscriptionsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: subscriptionStatusSchema.optional(),
  planId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createSubscriptionSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  status: subscriptionStatusSchema.default('active'),
  seats: z.number().int().min(1).max(1000).default(1),
  currentPeriodStart: isoDateTimeSchema.optional(),
  currentPeriodEnd: isoDateTimeSchema.nullable().optional(),
  trialEndsAt: isoDateTimeSchema.nullable().optional(),
  notes: notesSchema.optional(),
  payment: z
    .object({
      amountCents: z.number().int().min(0).optional(),
      currency: currencySchema.optional(),
      method: paymentMethodSchema.default('manual'),
      status: paymentStatusSchema.default('succeeded'),
      paidAt: isoDateTimeSchema.optional(),
      description: descriptionSchema.optional(),
    })
    .optional(),
});

export const updateSubscriptionSchema = z
  .object({
    planId: z.string().uuid().optional(),
    status: subscriptionStatusSchema.optional(),
    seats: z.number().int().min(1).max(1000).optional(),
    currentPeriodStart: isoDateTimeSchema.optional(),
    currentPeriodEnd: isoDateTimeSchema.nullable().optional(),
    trialEndsAt: isoDateTimeSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

export const cancelSubscriptionSchema = optionalJsonBody(
  z.object({
    atPeriodEnd: z.boolean().default(false),
    notes: notesSchema.optional(),
  }),
);

export const renewSubscriptionSchema = optionalJsonBody(
  z.object({
    payment: z
      .object({
        amountCents: z.number().int().min(0).optional(),
        currency: currencySchema.optional(),
        method: paymentMethodSchema.default('manual'),
        status: paymentStatusSchema.default('succeeded'),
        paidAt: isoDateTimeSchema.optional(),
        description: descriptionSchema.optional(),
      })
      .optional(),
  }),
);

export const listAdminPaymentsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  userId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  currency: currencySchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPaymentSchema = z
  .object({
    userId: z.string().uuid().optional(),
    subscriptionId: z.string().uuid().optional(),
    planId: z.string().uuid().optional(),
    amountCents: z.number().int().min(0),
    currency: currencySchema.default('USD'),
    status: paymentStatusSchema.default('succeeded'),
    method: paymentMethodSchema.default('manual'),
    provider: z.string().trim().max(32).optional(),
    providerRef: z.string().trim().max(128).optional(),
    description: descriptionSchema.optional(),
    notes: notesSchema.optional(),
    paidAt: isoDateTimeSchema.optional(),
  })
  .refine((body) => Boolean(body.userId || body.subscriptionId), {
    message: 'userId or subscriptionId is required',
    path: ['userId'],
  });

export const updatePaymentSchema = z
  .object({
    status: z.enum(['pending', 'succeeded', 'failed']).optional(),
    notes: notesSchema.nullable().optional(),
    description: descriptionSchema.nullable().optional(),
    provider: z.string().trim().max(32).nullable().optional(),
    providerRef: z.string().trim().max(128).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

export const refundPaymentSchema = optionalJsonBody(
  z.object({
    notes: notesSchema.optional(),
  }),
);

export const revenueQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  groupBy: revenueGroupBySchema.default('day'),
  currency: currencySchema.optional(),
  planId: z.string().uuid().optional(),
  method: paymentMethodSchema.optional(),
  status: paymentStatusSchema.optional(),
});

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type RevenueGroupBy = z.infer<typeof revenueGroupBySchema>;
export type ListAdminSubscriptionsQuery = z.infer<typeof listAdminSubscriptionsQuerySchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type RenewSubscriptionInput = z.infer<typeof renewSubscriptionSchema>;
export type ListAdminPaymentsQuery = z.infer<typeof listAdminPaymentsQuerySchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

export type AdminSubscription = {
  id: string;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  trialEndsAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  plan: {
    id: string;
    slug: string;
    name: string;
    priceCents: number;
    currency: string;
    interval: 'one_time' | 'month' | 'year' | 'forever';
    intervalCount: number;
  };
};

export type AdminSubscriptionListResponse = {
  subscriptions: AdminSubscription[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type AdminPayment = {
  id: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  provider: string | null;
  providerRef: string | null;
  description: string | null;
  notes: string | null;
  paidAt: string;
  refundedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  plan: {
    id: string;
    slug: string;
    name: string;
  } | null;
  subscriptionId: string | null;
  recordedById: string | null;
};

export type AdminPaymentListResponse = {
  payments: AdminPayment[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type AdminUserDetail = {
  user: AdminUser & {
    weekStartsOn: number;
    emailVerifiedAt: string | null;
  };
  subscriptions: AdminSubscription[];
  payments: AdminPayment[];
};

export type RevenueTotals = {
  grossCents: number;
  refundedCents: number;
  netCents: number;
  paymentCount: number;
  refundCount: number;
  averageCents: number;
};

export type RevenueSeriesPoint = {
  period: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  paymentCount: number;
};

export type RevenueBreakdownRow = {
  key: string;
  label: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  paymentCount: number;
};

export type RevenueResponse = {
  from: string;
  to: string;
  groupBy: RevenueGroupBy;
  currency: string | null;
  totals: RevenueTotals;
  series: RevenueSeriesPoint[];
  byPlan: RevenueBreakdownRow[];
  byMethod: RevenueBreakdownRow[];
  byStatus: RevenueBreakdownRow[];
};
