import { z } from 'zod';

export const notificationAudienceSchema = z.enum(['user', 'admin']);

export const notificationTypeSchema = z.enum([
  'welcome',
  'email_verified',
  'habit_created',
  'habit_completed',
  'habit_streak',
  'payment_succeeded',
  'payment_failed',
  'payment_refunded',
  'subscription_started',
  'subscription_renewed',
  'subscription_canceled',
  'subscription_past_due',
  'user_banned',
  'user_unbanned',
  'plan_published',
  'admin_new_user',
  'admin_new_payment',
  'admin_subscription_canceled',
  'admin_user_banned',
]);

export const listNotificationsQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  type: notificationTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type NotificationAudience = z.infer<typeof notificationAudienceSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export type AppNotification = {
  id: string;
  audience: NotificationAudience;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  notifications: AppNotification[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  unreadCount: number;
};

export type UnreadCountResponse = {
  count: number;
};
