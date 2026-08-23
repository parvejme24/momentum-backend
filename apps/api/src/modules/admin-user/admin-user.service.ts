import type {
  AdminSubscription,
  AdminUserDetail,
  AdminUserListResponse,
  BanUserInput,
  GrantPlanAccessInput,
  ListAdminUsersQuery,
  UpdateAdminUserInput,
} from '@momentum/types';
import type { Prisma, UserRole } from '../../generated/prisma/client.js';
import { invalidateAuthStatus } from '../../lib/auth-cache.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { disconnectUser } from '../../lib/realtime.js';
import { assertNotLastLiveAdmin, assertNotSelf, revokeSessions } from '../admin/guards.js';
import { grantComplimentaryAccess } from '../admin-subscription/admin-subscription.service.js';
import {
  pageCount,
  skipTake,
  toAdminPayment,
  toAdminSubscription,
  toAdminUser,
} from '../admin/mappers.js';
import {
  notifyAdminsUserBanned,
  notifyUserBanned,
  notifyUserUnbanned,
} from '../notification/notification.events.js';

const userListSelect = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  lastActiveAt: true,
  bannedAt: true,
  bannedReason: true,
  deletedAt: true,
  _count: {
    select: {
      habits: { where: { archivedAt: null } },
    },
  },
  planSubscriptions: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      plan: { select: { id: true, slug: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

function listWhere(query: ListAdminUsersQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  switch (query.status) {
    case 'live':
      where.deletedAt = null;
      break;
    case 'active':
      where.deletedAt = null;
      where.bannedAt = null;
      break;
    case 'banned':
      where.deletedAt = null;
      where.bannedAt = { not: null };
      break;
    case 'trashed':
      where.deletedAt = { not: null };
      break;
    case 'all':
      break;
  }

  if (query.role) {
    where.role = query.role === 'admin' ? 'ADMIN' : 'CUSTOMER';
  }

  if (query.emailVerified === 'true') where.emailVerifiedAt = { not: null };
  if (query.emailVerified === 'false') where.emailVerifiedAt = null;

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  if (query.planSlug) {
    where.planSubscriptions = {
      some: { plan: { slug: query.planSlug } },
    };
  }

  return where;
}

function listOrderBy(query: ListAdminUsersQuery): Prisma.UserOrderByWithRelationInput[] {
  const dir = query.order;
  if (query.sort === 'name') return [{ name: dir }, { createdAt: 'desc' }];
  if (query.sort === 'email') return [{ email: dir }, { createdAt: 'desc' }];
  if (query.sort === 'createdAt') return [{ createdAt: dir }];
  return [{ lastActiveAt: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }];
}

async function requireUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userListSelect,
  });
  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function listUsers(query: ListAdminUsersQuery): Promise<AdminUserListResponse> {
  const where = listWhere(query);
  const { skip, take } = skipTake(query.page, query.limit);

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: listOrderBy(query),
      skip,
      take,
      select: userListSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map(toAdminUser),
    page: query.page,
    limit: query.limit,
    total,
    pageCount: pageCount(total, query.limit),
  };
}

export async function getUser(id: string): Promise<AdminUserDetail> {
  const user = await requireUser(id);

  const [subscriptions, payments] = await Promise.all([
    prisma.planSubscription.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: {
          select: {
            id: true,
            slug: true,
            name: true,
            priceCents: true,
            currency: true,
            interval: true,
            intervalCount: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { userId: id },
      orderBy: { paidAt: 'desc' },
      take: 20,
      include: {
        user: { select: { id: true, name: true, email: true } },
        plan: { select: { id: true, slug: true, name: true } },
      },
    }),
  ]);

  const detail = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { weekStartsOn: true, emailVerifiedAt: true },
  });

  return {
    user: {
      ...toAdminUser(user),
      weekStartsOn: detail.weekStartsOn,
      emailVerifiedAt: detail.emailVerifiedAt?.toISOString() ?? null,
    },
    subscriptions: subscriptions.map(toAdminSubscription),
    payments: payments.map(toAdminPayment),
  };
}

export async function updateUser(
  actorId: string,
  id: string,
  input: UpdateAdminUserInput,
): Promise<AdminUserDetail> {
  const existing = await requireUser(id);

  if (input.role && input.role === 'customer' && existing.role === 'ADMIN') {
    assertNotSelf(actorId, id, 'demote');
    await assertNotLastLiveAdmin(id);
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) {
    data.role = (input.role === 'admin' ? 'ADMIN' : 'CUSTOMER') satisfies UserRole;
  }

  await prisma.user.update({ where: { id }, data });
  return getUser(id);
}

export async function banUser(
  actorId: string,
  id: string,
  input: BanUserInput,
): Promise<AdminUserDetail> {
  assertNotSelf(actorId, id, 'ban');
  const existing = await requireUser(id);
  if (existing.deletedAt) throw AppError.conflict('Restore the user before banning');
  if (existing.bannedAt) throw AppError.conflict('User is already banned');
  await assertNotLastLiveAdmin(id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        bannedAt: new Date(),
        ...(input.reason !== undefined ? { bannedReason: input.reason } : {}),
      },
    }),
  ]);
  await revokeSessions(id);
  disconnectUser(id);
  await invalidateAuthStatus(id);
  notifyUserBanned(id, input.reason ?? null);
  notifyAdminsUserBanned({ userId: id, email: existing.email });
  return getUser(id);
}

export async function unbanUser(id: string): Promise<AdminUserDetail> {
  const existing = await requireUser(id);
  if (!existing.bannedAt) throw AppError.conflict('User is not banned');

  await prisma.user.update({
    where: { id },
    data: { bannedAt: null, bannedReason: null },
  });
  await invalidateAuthStatus(id);
  notifyUserUnbanned(id);
  return getUser(id);
}

export async function trashUser(actorId: string, id: string): Promise<AdminUserDetail> {
  assertNotSelf(actorId, id, 'trash');
  const existing = await requireUser(id);
  if (existing.deletedAt) throw AppError.conflict('User is already in trash');
  await assertNotLastLiveAdmin(id);

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await revokeSessions(id);
  await invalidateAuthStatus(id);
  return getUser(id);
}

export async function restoreUser(id: string): Promise<AdminUserDetail> {
  const existing = await requireUser(id);
  if (!existing.deletedAt) throw AppError.conflict('User is not in trash');

  await prisma.user.update({
    where: { id },
    data: { deletedAt: null },
  });
  await invalidateAuthStatus(id);
  return getUser(id);
}

export async function deleteUser(actorId: string, id: string): Promise<void> {
  assertNotSelf(actorId, id, 'delete');
  const existing = await requireUser(id);
  if (!existing.deletedAt) {
    throw AppError.conflict('Move the user to trash before permanently deleting');
  }
  await assertNotLastLiveAdmin(id);
  await prisma.user.delete({ where: { id } });
}

export async function grantPlanAccess(
  actorId: string,
  userId: string,
  input: GrantPlanAccessInput,
): Promise<AdminSubscription> {
  await requireUser(userId);
  return grantComplimentaryAccess(actorId, userId, input);
}
