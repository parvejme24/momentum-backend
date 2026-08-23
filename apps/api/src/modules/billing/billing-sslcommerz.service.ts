import type { CheckoutInput, CheckoutResponse, ConfirmCheckoutResponse } from '@momentum/types';
import type { Plan, User } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  assertSslCommerzAmountMatches,
  createSslCommerzTranId,
  initSslCommerzSession,
  isSslCommerzHighRisk,
  isSslCommerzPaidStatus,
  requireSslCommerzConfigured,
  validateSslCommerzPayment,
} from '../../lib/sslcommerz-client.js';
import { sslCommerzCallbackUrls } from '../../lib/sslcommerz.js';
import {
  fulfillCheckout,
  toCustomerSubscriptionFromRow,
  type CheckoutFulfillment,
} from './billing.service.js';

type PlanWithFeatures = Plan & {
  features: { label: string; sortOrder: number }[];
};

type SslCommerzCallbackPayload = {
  tran_id?: string;
  val_id?: string;
  status?: string;
  amount?: string;
  currency_type?: string;
  currency_amount?: string;
  risk_level?: string;
};

function activeConfirmResponse(
  subscription: ConfirmCheckoutResponse['subscription'],
): ConfirmCheckoutResponse {
  return {
    paymentStatus: 'succeeded',
    subscriptionStatus: 'active',
    subscription: { ...subscription, status: 'active' },
  };
}

async function requirePendingSslCommerzPayment(tranId: string) {
  const payment = await prisma.payment.findFirst({
    where: { provider: 'sslcommerz', providerRef: tranId },
    include: { plan: true },
  });
  if (!payment) throw AppError.notFound('SSLCommerz payment not found');

  if (payment.status === 'SUCCEEDED' && payment.subscriptionId) {
    const subscription = await prisma.planSubscription.findUnique({
      where: { id: payment.subscriptionId },
      include: {
        plan: { include: { features: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    if (subscription) {
      return { payment, subscription, alreadyFulfilled: true as const };
    }
  }

  if (payment.status !== 'PENDING') {
    throw AppError.conflict('This SSLCommerz payment is no longer pending');
  }

  return { payment, subscription: null, alreadyFulfilled: false as const };
}

async function completeSslCommerzPayment(input: {
  tranId: string;
  valId: string;
  expectedUserId?: string;
}): Promise<CheckoutFulfillment> {
  const pending = await requirePendingSslCommerzPayment(input.tranId);
  if (pending.alreadyFulfilled) {
    throw AppError.conflict('Payment already fulfilled');
  }

  const validation = await validateSslCommerzPayment(input.valId);
  if (!isSslCommerzPaidStatus(validation.status)) {
    await prisma.payment.update({
      where: { id: pending.payment.id },
      data: { status: 'FAILED' },
    });
    throw AppError.conflict('SSLCommerz payment was not successful');
  }

  if (validation.tran_id && validation.tran_id !== input.tranId) {
    throw AppError.conflict('SSLCommerz transaction mismatch');
  }

  if (input.expectedUserId && input.expectedUserId !== pending.payment.userId) {
    throw AppError.forbidden('This payment belongs to another account');
  }

  const planId = pending.payment.planId;
  if (!planId) throw AppError.conflict('Payment is missing plan metadata');

  if (isSslCommerzHighRisk(validation)) {
    logger.warn(
      {
        tranId: input.tranId,
        valId: input.valId,
        riskTitle: validation.risk_title,
      },
      'SSLCommerz marked payment as high risk — fulfilling but flagged in notes',
    );
  }

  const paidCents = assertSslCommerzAmountMatches({
    expectedAmountCents: pending.payment.amountCents,
    expectedCurrency: pending.payment.currency,
    validation,
  });

  return {
    sessionId: input.tranId,
    provider: 'sslcommerz',
    amountCents: paidCents,
    currency: pending.payment.currency.toUpperCase(),
    userId: pending.payment.userId,
    planId,
    seats: 1,
    receiptUrl: validation.bank_tran_id ? `sslcommerz:${validation.bank_tran_id}` : null,
    paymentMethod: 'OTHER',
    valId: input.valId,
  };
}

export async function startSslCommerzCheckout(
  user: User,
  input: CheckoutInput,
  plan: PlanWithFeatures,
): Promise<CheckoutResponse> {
  requireSslCommerzConfigured();

  const callbacks = sslCommerzCallbackUrls();
  const tranId = createSslCommerzTranId(user.id);
  const currency = plan.currency.toUpperCase();

  await prisma.payment.create({
    data: {
      userId: user.id,
      planId: plan.id,
      amountCents: plan.priceCents,
      currency,
      status: 'PENDING',
      method: 'OTHER',
      provider: 'sslcommerz',
      providerRef: tranId,
      description: `SSLCommerz payment for ${plan.name}`,
    },
  });

  const successUrl = input.successUrl ?? callbacks.successUrl;
  const failUrl = callbacks.failUrl;
  const cancelUrl = input.cancelUrl ?? callbacks.cancelUrl;

  try {
    const session = await initSslCommerzSession({
      tranId,
      amount: plan.priceCents / 100,
      currency,
      productName: plan.name,
      productCategory: 'subscription',
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: '01700000000',
      successUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}tran_id=${encodeURIComponent(tranId)}`,
      failUrl,
      cancelUrl,
      ipnUrl: callbacks.ipnUrl,
      userId: user.id,
      planId: plan.id,
      seats: input.seats,
    });

    return {
      provider: 'sslcommerz',
      url: session.gatewayUrl,
      sessionId: tranId,
      publishableKey: '',
      subscription: null,
    };
  } catch (err) {
    await prisma.payment.updateMany({
      where: { provider: 'sslcommerz', providerRef: tranId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    throw err;
  }
}

export async function confirmSslCommerzCheckout(
  userId: string,
  input: { tranId: string; valId?: string },
): Promise<ConfirmCheckoutResponse> {
  const pending = await requirePendingSslCommerzPayment(input.tranId);
  if (pending.alreadyFulfilled && pending.subscription) {
    return activeConfirmResponse(toCustomerSubscriptionFromRow(pending.subscription));
  }

  if (!input.valId) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'valId', issue: 'is required to confirm SSLCommerz payment' },
    ]);
  }

  const fulfillment = await completeSslCommerzPayment({
    tranId: input.tranId,
    valId: input.valId,
    expectedUserId: userId,
  });

  const subscription = await fulfillCheckout(fulfillment);
  return activeConfirmResponse(subscription);
}

export async function handleSslCommerzIpn(payload: SslCommerzCallbackPayload): Promise<void> {
  const tranId = payload.tran_id;
  const valId = payload.val_id;
  if (!tranId || !valId) return;

  // IPN can send VALID / FAILED / CANCELLED / EXPIRED / UNATTEMPTED.
  // Only VALID should be validated via Order Validation API.
  if (!isSslCommerzPaidStatus(payload.status)) {
    if (
      payload.status === 'FAILED' ||
      payload.status === 'CANCELLED' ||
      payload.status === 'EXPIRED'
    ) {
      await prisma.payment.updateMany({
        where: { provider: 'sslcommerz', providerRef: tranId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }
    return;
  }

  const pending = await requirePendingSslCommerzPayment(tranId);
  if (pending.alreadyFulfilled) return;

  const fulfillment = await completeSslCommerzPayment({ tranId, valId });
  await fulfillCheckout(fulfillment);
}
