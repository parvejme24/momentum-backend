import { z } from 'zod';
import type { PlanLimits } from './pricing.js';

export type UserEntitlements = {
  planSlug: string;
  planName: string;
  tier: 'free' | 'pro';
  source: 'subscription' | 'complimentary' | 'default';
  limits: PlanLimits;
  aiEnabled: boolean;
  activeHabits: number;
  maxHabits: number | null;
  expiresAt: string | null;
  isLifetime: boolean;
};

export const grantPlanAccessSchema = z
  .object({
    planSlug: z.enum(['pro-year', 'pro-lifetime']).default('pro-year'),
    accessType: z.enum(['timed', 'lifetime']),
    days: z.number().int().min(1).max(3650).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.accessType === 'timed' && value.days === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['days'],
        message: 'is required when accessType is timed',
      });
    }
  });

export type GrantPlanAccessInput = z.infer<typeof grantPlanAccessSchema>;
