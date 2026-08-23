import type {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  ListAdminSubscriptionsQuery,
  RenewSubscriptionInput,
  UpdateSubscriptionInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as subscriptionService from './admin-subscription.service.js';

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
  const result = await subscriptionService.listSubscriptions(
    req.query as unknown as ListAdminSubscriptionsQuery,
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionService.getSubscription(requireParam(req, 'id'));
  res.status(200).json({ subscription });
}

export async function create(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionService.createSubscription(
    requireUserId(req),
    req.body as CreateSubscriptionInput,
  );
  res.status(201).json({ subscription });
}

export async function update(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionService.updateSubscription(
    requireParam(req, 'id'),
    req.body as UpdateSubscriptionInput,
  );
  res.status(200).json({ subscription });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionService.cancelSubscription(
    requireParam(req, 'id'),
    req.body as CancelSubscriptionInput,
  );
  res.status(200).json({ subscription });
}

export async function renew(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionService.renewSubscription(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as RenewSubscriptionInput,
  );
  res.status(200).json({ subscription });
}
