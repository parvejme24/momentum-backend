import type {
  BanUserInput,
  GrantPlanAccessInput,
  ListAdminUsersQuery,
  UpdateAdminUserInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as adminUserService from './admin-user.service.js';

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
  const result = await adminUserService.listUsers(req.query as unknown as ListAdminUsersQuery);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.getUser(requireParam(req, 'id'));
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.updateUser(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as UpdateAdminUserInput,
  );
  res.status(200).json(result);
}

export async function ban(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.banUser(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as BanUserInput,
  );
  res.status(200).json(result);
}

export async function unban(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.unbanUser(requireParam(req, 'id'));
  res.status(200).json(result);
}

export async function trash(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.trashUser(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json(result);
}

export async function restore(req: Request, res: Response): Promise<void> {
  const result = await adminUserService.restoreUser(requireParam(req, 'id'));
  res.status(200).json(result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await adminUserService.deleteUser(requireUserId(req), requireParam(req, 'id'));
  res.status(200).json({ success: true });
}

export async function grantAccess(req: Request, res: Response): Promise<void> {
  const subscription = await adminUserService.grantPlanAccess(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as GrantPlanAccessInput,
  );
  res.status(201).json({ subscription });
}
