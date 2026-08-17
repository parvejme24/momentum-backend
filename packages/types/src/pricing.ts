import { z } from 'zod';

export const planIntervalSchema = z.enum(['one_time', 'month', 'year', 'forever']);
export const planStatusSchema = z.enum(['draft', 'published', 'archived']);
export const userRoleSchema = z.enum(['admin', 'customer']);

export const planLimitsSchema = z
  .object({
    maxHabits: z.number().int().nonnegative().nullable().optional(),
    heatmapDays: z.number().int().nonnegative().nullable().optional(),
    reminders: z
      .union([z.number().int().nonnegative(), z.enum(['one_device', 'all_devices'])])
      .optional(),
    export: z.array(z.enum(['csv', 'json'])).optional(),
    sharedBoards: z.boolean().optional(),
    adminSeats: z.number().int().nonnegative().nullable().optional(),
    stats: z.boolean().optional(),
  })
  .strict();

export const planSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be URL-safe lowercase (e.g. pro, team-plus)');

const featureItemSchema = z.string().trim().min(1).max(120);

export const createPlanSchema = z.object({
  slug: planSlugSchema,
  name: z.string().trim().min(1).max(80),
  blurb: z.string().trim().min(1).max(280),
  priceCents: z.number().int().min(0),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code')
    .default('USD'),
  interval: planIntervalSchema,
  intervalCount: z.number().int().min(1).default(1),
  seatBased: z.boolean().default(false),
  highlighted: z.boolean().default(false),
  ctaLabel: z.string().trim().min(1).max(40).default('Get started'),
  ctaHref: z.string().trim().min(1).max(200).default('/register'),
  features: z.array(featureItemSchema).min(1).max(20),
  limits: planLimitsSchema.default({}),
});

export const updatePlanSchema = z
  .object({
    slug: planSlugSchema.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    blurb: z.string().trim().min(1).max(280).optional(),
    priceCents: z.number().int().min(0).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code')
      .optional(),
    interval: planIntervalSchema.optional(),
    intervalCount: z.number().int().min(1).optional(),
    seatBased: z.boolean().optional(),
    highlighted: z.boolean().optional(),
    ctaLabel: z.string().trim().min(1).max(40).optional(),
    ctaHref: z.string().trim().min(1).max(200).optional(),
    features: z.array(featureItemSchema).min(1).max(20).optional(),
    limits: planLimitsSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

export const listAdminPlansQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived', 'all']).default('all'),
});

export const planIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const planSlugParamsSchema = z.object({
  slug: planSlugSchema,
});

export const reorderPlansSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export type PlanInterval = z.infer<typeof planIntervalSchema>;
export type PlanStatus = z.infer<typeof planStatusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type ListAdminPlansQuery = z.infer<typeof listAdminPlansQuerySchema>;
export type ReorderPlansInput = z.infer<typeof reorderPlansSchema>;

export type PublicPlan = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  intervalCount: number;
  seatBased: boolean;
  highlighted: boolean;
  ctaLabel: string;
  ctaHref: string;
  features: string[];
  limits: PlanLimits;
};

export type AdminPlan = PublicPlan & {
  status: PlanStatus;
  sortOrder: number;
  currentVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  updatedById: string | null;
};

export type UpdatePlanResponse = {
  plan: AdminPlan;
  versionCreated: boolean;
  message: string | null;
};

export type CompareRow = {
  key: string;
  label: string;
  values: Record<string, string>;
};

export type CompareResponse = {
  plans: Array<{ slug: string; name: string; highlighted: boolean }>;
  rows: CompareRow[];
};
