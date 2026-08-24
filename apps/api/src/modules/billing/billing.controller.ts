import type {
  BillingPortalInput,
  CancelBillingInput,
  CheckoutInput,
  ConfirmCheckoutInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as billingService from './billing.service.js';
import { handleSslCommerzIpn } from './billing-sslcommerz.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

export function config(_req: Request, res: Response): void {
  res.status(200).json(billingService.getConfig());
}

export async function entitlements(req: Request, res: Response): Promise<void> {
  const result = await billingService.getMyEntitlements(requireUserId(req));
  res.status(200).json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  const result = await billingService.getMySubscription(requireUserId(req));
  res.status(200).json(result);
}

export async function invoices(req: Request, res: Response): Promise<void> {
  const result = await billingService.listMyInvoices(requireUserId(req));
  res.status(200).json(result);
}

export async function checkout(req: Request, res: Response): Promise<void> {
  const result = await billingService.startCheckout(requireUserId(req), req.body as CheckoutInput);
  res.status(result.subscription ? 200 : 201).json(result);
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const result = await billingService.confirmCheckout(
    requireUserId(req),
    req.body as ConfirmCheckoutInput,
  );
  res.status(200).json(result);
}

export async function portal(req: Request, res: Response): Promise<void> {
  const result = await billingService.createPortalSession(
    requireUserId(req),
    req.body as BillingPortalInput,
  );
  res.status(200).json(result);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const result = await billingService.cancelMySubscription(
    requireUserId(req),
    req.body as CancelBillingInput,
  );
  res.status(200).json(result);
}

export async function sslCommerzIpn(req: Request, res: Response): Promise<void> {
  const payload = req.body as Record<string, unknown>;
  const tranId = stringField(payload.tran_id);
  const valId = stringField(payload.val_id);
  const status = stringField(payload.status);
  const amount = stringField(payload.amount);
  await handleSslCommerzIpn({
    ...(tranId ? { tran_id: tranId } : {}),
    ...(valId ? { val_id: valId } : {}),
    ...(status ? { status } : {}),
    ...(amount ? { amount } : {}),
  });
  res.status(200).json({ received: true });
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function webhook(req: Request, res: Response): Promise<void> {
  const signatureHeader = req.headers['stripe-signature'];
  const signature =
    typeof signatureHeader === 'string'
      ? signatureHeader
      : Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : undefined;
  const raw: unknown = req.body;
  if (!Buffer.isBuffer(raw)) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'body', issue: 'must be the raw Stripe payload' },
    ]);
  }

  await billingService.handleStripeWebhook(raw, signature);
  res.status(200).json({ received: true });
}
