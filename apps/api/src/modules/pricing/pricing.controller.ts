import type {
  CreatePlanInput,
  ListAdminPlansQuery,
  ReorderPlansInput,
  UpdatePlanInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as pricingService from './pricing.service.js';

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

export async function listPublic(_req: Request, res: Response): Promise<void> {
  const plans = await pricingService.listPublishedPlans();
  res.status(200).json({ plans });
}

export async function getPublicBySlug(req: Request, res: Response): Promise<void> {
  const plan = await pricingService.getPublishedPlanBySlug(requireParam(req, 'slug'));
  res.status(200).json({ plan });
}

export async function compare(_req: Request, res: Response): Promise<void> {
  const result = await pricingService.getCompareTable();
  res.status(200).json(result);
}

export async function listAdmin(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAdminPlansQuery;
  const plans = await pricingService.listAdminPlans(query);
  res.status(200).json({ plans });
}

export async function getAdmin(req: Request, res: Response): Promise<void> {
  const plan = await pricingService.getAdminPlan(requireParam(req, 'id'));
  res.status(200).json({ plan });
}

export async function create(req: Request, res: Response): Promise<void> {
  const plan = await pricingService.createPlan(requireUserId(req), req.body as CreatePlanInput);
  res.status(201).json({ plan });
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await pricingService.updatePlan(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as UpdatePlanInput,
  );
  res.status(200).json(result);
}

export async function publish(req: Request, res: Response): Promise<void> {
  const plan = await pricingService.publishPlan(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json({ plan });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const plan = await pricingService.archivePlan(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json({ plan });
}

export async function reorder(req: Request, res: Response): Promise<void> {
  const plans = await pricingService.reorderPlans(
    requireUserId(req),
    req.body as ReorderPlansInput,
  );
  res.status(200).json({ plans });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await pricingService.deletePlan(requireParam(req, 'id'));
  res.status(200).json({ success: true });
}
