import { z } from 'zod';

export const pushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const registerDeviceSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(500)
    .refine((value) => value.startsWith('https://'), {
      message: 'must be an https URL',
    }),
  keys: pushSubscriptionKeysSchema,
  deviceName: z.string().trim().min(1).max(60).optional(),
  /** Accepted but ignored — devices are always stored as WEB. */
  platform: z.enum(['WEB', 'IOS', 'ANDROID']).optional(),
});

export const deviceIdParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type DeviceIdParams = z.infer<typeof deviceIdParamsSchema>;

export type DeviceResponse = {
  id: string;
  deviceName: string | null;
  platform: 'WEB' | 'IOS' | 'ANDROID';
  lastSeenAt: string;
  createdAt: string;
};

export type VapidPublicKeyResponse = {
  publicKey: string;
};
