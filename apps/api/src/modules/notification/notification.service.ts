import type {
  AppNotification,
  ListNotificationsQuery,
  NotificationAudience,
  NotificationListResponse,
  NotificationType,
} from '@momentum/types';
import type {
  NotificationAudience as DbAudience,
  NotificationType as DbType,
  Prisma,
} from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { emitToUser } from '../../lib/realtime.js';
import { AppError } from '../../lib/errors.js';
import { pageCount, skipTake } from '../admin/mappers.js';

const TYPE_TO_DB: Record<NotificationType, DbType> = {
  welcome: 'WELCOME',
  email_verified: 'EMAIL_VERIFIED',
  habit_created: 'HABIT_CREATED',
  habit_completed: 'HABIT_COMPLETED',
  habit_streak: 'HABIT_STREAK',
  payment_succeeded: 'PAYMENT_SUCCEEDED',
  payment_failed: 'PAYMENT_FAILED',
  payment_refunded: 'PAYMENT_REFUNDED',
  subscription_started: 'SUBSCRIPTION_STARTED',
  subscription_renewed: 'SUBSCRIPTION_RENEWED',
  subscription_canceled: 'SUBSCRIPTION_CANCELED',
  subscription_past_due: 'SUBSCRIPTION_PAST_DUE',
  user_banned: 'USER_BANNED',
  user_unbanned: 'USER_UNBANNED',
  plan_published: 'PLAN_PUBLISHED',
  admin_new_user: 'ADMIN_NEW_USER',
  admin_new_payment: 'ADMIN_NEW_PAYMENT',
  admin_subscription_canceled: 'ADMIN_SUBSCRIPTION_CANCELED',
  admin_user_banned: 'ADMIN_USER_BANNED',
};

const TYPE_FROM_DB: Record<DbType, NotificationType> = {
  WELCOME: 'welcome',
  EMAIL_VERIFIED: 'email_verified',
  HABIT_CREATED: 'habit_created',
  HABIT_COMPLETED: 'habit_completed',
  HABIT_STREAK: 'habit_streak',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  SUBSCRIPTION_PAST_DUE: 'subscription_past_due',
  USER_BANNED: 'user_banned',
  USER_UNBANNED: 'user_unbanned',
  PLAN_PUBLISHED: 'plan_published',
  ADMIN_NEW_USER: 'admin_new_user',
  ADMIN_NEW_PAYMENT: 'admin_new_payment',
  ADMIN_SUBSCRIPTION_CANCELED: 'admin_subscription_canceled',
  ADMIN_USER_BANNED: 'admin_user_banned',
};

const AUDIENCE_TO_DB: Record<NotificationAudience, DbAudience> = {
  user: 'USER',
  admin: 'ADMIN',
};

const AUDIENCE_FROM_DB: Record<DbAudience, NotificationAudience> = {
  USER: 'user',
  ADMIN: 'admin',
};

const UNREAD_TTL_SECONDS = 60 * 60 * 24 * 30;

export type NotifyInput = {
  userId: string;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function unreadKey(userId: string, audience: NotificationAudience): string {
  return `momentum:notify:unread:${audience}:${userId}`;
}

function jsonData(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    data[key] = entry;
  }
  return data;
}

function toPublic(row: {
  id: string;
  audience: DbAudience;
  type: DbType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): AppNotification {
  return {
    id: row.id,
    audience: AUDIENCE_FROM_DB[row.audience],
    type: TYPE_FROM_DB[row.type],
    title: row.title,
    body: row.body,
    data: jsonData(row.data),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function bumpUnread(userId: string, audience: NotificationAudience): Promise<number> {
  const key = unreadKey(userId, audience);
  try {
    const count = await redis.incr(key);
    await redis.expire(key, UNREAD_TTL_SECONDS);
    return count;
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to bump unread notification count');
    return prisma.notification.count({
      where: { userId, audience: AUDIENCE_TO_DB[audience], readAt: null },
    });
  }
}

async function dropUnread(userId: string, audience: NotificationAudience, by = 1): Promise<void> {
  const key = unreadKey(userId, audience);
  try {
    const next = await redis.decrby(key, by);
    if (next <= 0) await redis.del(key);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to drop unread notification count');
  }
}

async function clearUnread(userId: string, audience: NotificationAudience): Promise<void> {
  try {
    await redis.del(unreadKey(userId, audience));
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to clear unread notification count');
  }
}

export async function unreadCount(userId: string, audience: NotificationAudience): Promise<number> {
  const key = unreadKey(userId, audience);
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      const parsed = Number(cached);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to read unread notification count');
  }

  const count = await prisma.notification.count({
    where: { userId, audience: AUDIENCE_TO_DB[audience], readAt: null },
  });

  try {
    if (count > 0) {
      await redis.set(key, String(count), 'EX', UNREAD_TTL_SECONDS);
    }
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to cache unread notification count');
  }

  return count;
}

export async function dispatch(input: NotifyInput): Promise<AppNotification> {
  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      audience: AUDIENCE_TO_DB[input.audience],
      type: TYPE_TO_DB[input.type],
      title: input.title,
      body: input.body,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
    },
  });

  const payload = toPublic(created);
  const count = await bumpUnread(input.userId, input.audience);
  emitToUser(input.userId, 'notification', payload);
  emitToUser(input.userId, 'notification:unread', { audience: input.audience, count });
  return payload;
}

export function notifyLater(work: Promise<unknown>): void {
  void work.catch((err: unknown) => {
    logger.error({ err }, 'Notification dispatch failed');
  });
}

export async function notifyAdmins(input: Omit<NotifyInput, 'userId' | 'audience'>): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', deletedAt: null, bannedAt: null },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      dispatch({
        userId: admin.id,
        audience: 'admin',
        type: input.type,
        title: input.title,
        body: input.body,
        ...(input.data !== undefined ? { data: input.data } : {}),
      }),
    ),
  );
}

export async function listNotifications(
  userId: string,
  audience: NotificationAudience,
  query: ListNotificationsQuery,
): Promise<NotificationListResponse> {
  const where: Prisma.NotificationWhereInput = {
    userId,
    audience: AUDIENCE_TO_DB[audience],
    ...(query.unread === 'true' ? { readAt: null } : {}),
    ...(query.unread === 'false' ? { readAt: { not: null } } : {}),
    ...(query.type ? { type: TYPE_TO_DB[query.type] } : {}),
  };

  const { skip, take } = skipTake(query.page, query.limit);
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.notification.count({ where }),
    unreadCount(userId, audience),
  ]);

  return {
    notifications: rows.map(toPublic),
    page: query.page,
    limit: query.limit,
    total,
    pageCount: pageCount(total, query.limit),
    unreadCount: unread,
  };
}

export async function markRead(
  userId: string,
  audience: NotificationAudience,
  id: string,
): Promise<AppNotification> {
  const existing = await prisma.notification.findFirst({
    where: { id, userId, audience: AUDIENCE_TO_DB[audience] },
  });
  if (!existing) throw AppError.notFound('Notification not found');

  if (existing.readAt) return toPublic(existing);

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  await dropUnread(userId, audience);
  const count = await unreadCount(userId, audience);
  emitToUser(userId, 'notification:unread', { audience, count });
  return toPublic(updated);
}

export async function markAllRead(
  userId: string,
  audience: NotificationAudience,
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, audience: AUDIENCE_TO_DB[audience], readAt: null },
    data: { readAt: new Date() },
  });
  await clearUnread(userId, audience);
  emitToUser(userId, 'notification:unread', { audience, count: 0 });
  return { count: result.count };
}

export async function deleteNotification(
  userId: string,
  audience: NotificationAudience,
  id: string,
): Promise<void> {
  const existing = await prisma.notification.findFirst({
    where: { id, userId, audience: AUDIENCE_TO_DB[audience] },
  });
  if (!existing) throw AppError.notFound('Notification not found');

  await prisma.notification.delete({ where: { id } });
  if (!existing.readAt) {
    await dropUnread(userId, audience);
    const count = await unreadCount(userId, audience);
    emitToUser(userId, 'notification:unread', { audience, count });
  }
}
