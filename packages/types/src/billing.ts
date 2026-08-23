import { z } from 'zod';
import type { SubscriptionStatus } from './admin-billing.js';
import type { PlanInterval } from './pricing.js';

export const paymentProviderSchema = z.enum(['stripe', 'sslcommerz']);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const checkoutSchema = z.object({
  planId: z.string().uuid(),
  provider: paymentProviderSchema.default('stripe'),
  seats: z.number().int().min(1).max(1000).default(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const confirmCheckoutSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('stripe'),
    sessionId: z.string().trim().min(1).max(255),
  }),
  z.object({
    provider: z.literal('sslcommerz'),
    tranId: z.string().trim().min(1).max(40),
    valId: z.string().trim().min(1).max(255).optional(),
  }),
]);

export const sslCommerzIpnSchema = z.record(z.string(), z.unknown());

export const billingPortalSchema = z.preprocess(
  (value) => (value === undefined || value === null ? {} : value),
  z.object({
    returnUrl: z.string().url().optional(),
  }),
);

export const cancelBillingSchema = z.preprocess(
  (value) => (value === undefined || value === null ? {} : value),
  z.object({
    atPeriodEnd: z.boolean().default(true),
  }),
);

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
export type BillingPortalInput = z.infer<typeof billingPortalSchema>;
export type CancelBillingInput = z.infer<typeof cancelBillingSchema>;

export type BillingConfig = {
  /** @deprecated Use `stripe.publishableKey` */
  publishableKey: string;
  /** @deprecated Use `stripe.configured` */
  configured: boolean;
  stripe: {
    publishableKey: string;
    configured: boolean;
  };
  sslcommerz: {
    configured: boolean;
    sandbox: boolean;
    successUrl: string;
    failUrl: string;
    cancelUrl: string;
  };
};

export type MediaConfig = {
  cloudinary: {
    configured: boolean;
    cloudName: string;
  };
};

export type CustomerPlanSummary = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  intervalCount: number;
  features: string[];
};

export type CustomerSubscription = {
  id: string;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  plan: CustomerPlanSummary;
};

export type CustomerInvoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  paidAt: string;
  description: string | null;
  receiptUrl: string | null;
};

export type CheckoutResponse = {
  provider: PaymentProvider;
  url: string | null;
  sessionId: string | null;
  publishableKey: string;
  subscription: CustomerSubscription | null;
};

export type ConfirmCheckoutResponse = {
  /** Always "succeeded" after a verified payment. */
  paymentStatus: 'succeeded';
  /** Always "active" after a verified payment. */
  subscriptionStatus: 'active';
  subscription: CustomerSubscription;
};
