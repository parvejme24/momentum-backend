import { z } from 'zod';
import { nameSchema } from './auth.js';
import { userRoleSchema } from './pricing.js';

export const adminUserStatusSchema = z.enum(['live', 'active', 'banned', 'trashed', 'all']);
export const adminUserSortSchema = z.enum(['createdAt', 'lastActiveAt', 'name', 'email']);
export const sortOrderSchema = z.enum(['asc', 'desc']);

export const listAdminUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: userRoleSchema.optional(),
  status: adminUserStatusSchema.default('live'),
  planSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: adminUserSortSchema.default('lastActiveAt'),
  order: sortOrderSchema.default('desc'),
});

export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateAdminUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: userRoleSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

const optionalJsonBody = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? {} : value), schema);

export const banUserSchema = optionalJsonBody(
  z.object({
    reason: z.string().trim().min(1).max(280).optional(),
  }),
);

export type AdminUserStatusFilter = z.infer<typeof adminUserStatusSchema>;
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
export type BanUserInput = z.infer<typeof banUserSchema>;

export type AdminUserAccountStatus = 'active' | 'banned' | 'trashed';

export type AdminUserPlan = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  currentPeriodEnd: string | null;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: 'admin' | 'customer';
  status: AdminUserAccountStatus;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
  deletedAt: string | null;
  habitCount: number;
  plan: AdminUserPlan | null;
};

export type AdminUserListResponse = {
  users: AdminUser[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};
