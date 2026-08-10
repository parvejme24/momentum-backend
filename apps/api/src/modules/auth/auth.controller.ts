import type {
  ChangePasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  UpdateMeInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as authService from './auth.service.js';

function clientMeta(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip;

  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ipAddress: ipAddress ?? null,
    deviceId: typeof req.headers['x-device-id'] === 'string' ? req.headers['x-device-id'] : null,
  };
}

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return req.userId;
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterInput;
  const result = await authService.register(body, clientMeta(req));
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const result = await authService.login(body, clientMeta(req));
  res.status(200).json(result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const body = req.body as RefreshInput;
  const result = await authService.refresh(body.refreshToken, clientMeta(req));
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const body = req.body as LogoutInput;
  await authService.logout(body.refreshToken);
  res.status(204).send();
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(requireUserId(req));
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(requireUserId(req));
  res.status(200).json({ user });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateMeInput;
  const user = await authService.updateMe(requireUserId(req), body);
  res.status(200).json({ user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const body = req.body as ChangePasswordInput;
  await authService.changePassword(requireUserId(req), body);
  res.status(200).json({
    success: true,
    message: 'Password changed successfully. Please log in again.',
  });
}
