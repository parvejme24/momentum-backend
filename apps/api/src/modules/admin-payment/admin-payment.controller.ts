import type {
  CreatePaymentInput,
  ListAdminPaymentsQuery,
  RefundPaymentInput,
  RevenueQuery,
  UpdatePaymentInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as paymentService from './admin-payment.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

function requireParam(req: Request, key: string): string {
  const raw = req.params[key];
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (!value) {
    throw AppError.notFound('Not found');
  }
  return value;
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await paymentService.listPayments(req.query as unknown as ListAdminPaymentsQuery);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const payment = await paymentService.getPayment(requireParam(req, 'id'));
  res.status(200).json({ payment });
}

export async function create(req: Request, res: Response): Promise<void> {
  const payment = await paymentService.createPayment(
    requireUserId(req),
    req.body as CreatePaymentInput,
  );
  res.status(201).json({ payment });
}

export async function update(req: Request, res: Response): Promise<void> {
  const payment = await paymentService.updatePayment(
    requireParam(req, 'id'),
    req.body as UpdatePaymentInput,
  );
  res.status(200).json({ payment });
}

export async function refund(req: Request, res: Response): Promise<void> {
  const payment = await paymentService.refundPayment(
    requireParam(req, 'id'),
    req.body as RefundPaymentInput,
  );
  res.status(200).json({ payment });
}

export async function revenue(req: Request, res: Response): Promise<void> {
  const result = await paymentService.getRevenue(req.query as unknown as RevenueQuery);
  res.status(200).json(result);
}
