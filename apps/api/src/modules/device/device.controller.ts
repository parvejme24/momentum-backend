import type { RegisterDeviceInput } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as deviceService from './device.service.js';

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
  const devices = await deviceService.listDevices(requireUserId(req));
  res.status(200).json({ devices });
}

export async function register(req: Request, res: Response): Promise<void> {
  const userAgent = req.get('user-agent') ?? undefined;
  const device = await deviceService.registerDevice(
    requireUserId(req),
    req.body as RegisterDeviceInput,
    userAgent,
  );
  res.status(200).json({ device });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await deviceService.deleteDevice(requireUserId(req), requireParam(req, 'deviceId'));
  res.status(200).json({ success: true });
}

export function vapidPublicKey(_req: Request, res: Response): void {
  res.status(200).json(deviceService.getVapidPublicKey());
}
