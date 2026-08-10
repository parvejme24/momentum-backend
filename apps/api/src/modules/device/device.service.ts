import type { DeviceResponse, RegisterDeviceInput } from '@momentum/types';
import type { Device } from '../../generated/prisma/client.js';
import { env } from '../../lib/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const PUSH_TOKEN_MAX = 512;

/**
 * `Device.pushToken` stores the full Web Push subscription as a JSON string:
 * `{ "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }`.
 * It is not a bare FCM/APNs token. Parse with JSON.parse on read (worker).
 */
function serializeSubscription(input: RegisterDeviceInput): string {
  const payload = {
    endpoint: input.endpoint,
    keys: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > PUSH_TOKEN_MAX) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'endpoint', issue: 'subscription is too large to store' },
    ]);
  }
  return serialized;
}

function toPublicDevice(device: Device): DeviceResponse {
  return {
    id: device.id,
    deviceName: device.deviceName,
    platform: device.platform,
    lastSeenAt: device.lastSeenAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}

/** Crude display label from a User-Agent string. */
export function deviceNameFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Web browser';

  let browser = 'Browser';
  if (/Edg\//i.test(userAgent)) browser = 'Edge';
  else if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';

  let os = 'Unknown';
  if (/Windows/i.test(userAgent)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(userAgent)) os = 'macOS';
  else if (/Android/i.test(userAgent)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';
  else if (/Linux/i.test(userAgent)) os = 'Linux';

  const label = `${browser} on ${os}`;
  return label.length > 60 ? label.slice(0, 60) : label;
}

export async function listDevices(userId: string): Promise<DeviceResponse[]> {
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
  return devices.map(toPublicDevice);
}

export async function registerDevice(
  userId: string,
  input: RegisterDeviceInput,
  userAgent?: string,
): Promise<DeviceResponse> {
  // platform from the body is ignored — web-only product always stores WEB
  const pushToken = serializeSubscription(input);
  const deviceName = input.deviceName ?? deviceNameFromUserAgent(userAgent);

  const device = await prisma.device.upsert({
    where: { pushToken },
    create: {
      userId,
      platform: 'WEB',
      pushToken,
      deviceName,
      lastSeenAt: new Date(),
    },
    update: {
      userId,
      platform: 'WEB',
      deviceName,
      lastSeenAt: new Date(),
    },
  });

  return toPublicDevice(device);
}

export async function deleteDevice(userId: string, deviceId: string): Promise<void> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) throw AppError.notFound('Device not found');
  await prisma.device.delete({ where: { id: device.id } });
}

export function getVapidPublicKey(): { publicKey: string } {
  return { publicKey: env.VAPID_PUBLIC_KEY ?? '' };
}
