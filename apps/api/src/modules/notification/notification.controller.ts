import type { ListNotificationsQuery, NotificationAudience } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as notificationService from './notification.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

function requireParam(req: Request, key: string): string {
  const raw = req.params[key];
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (!value) throw AppError.notFound('Not found');
  return value;
}

function handlers(audience: NotificationAudience) {
  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const result = await notificationService.listNotifications(
        requireUserId(req),
        audience,
        req.query as unknown as ListNotificationsQuery,
      );
      res.status(200).json(result);
    },

    unread: async (req: Request, res: Response): Promise<void> => {
      const count = await notificationService.unreadCount(requireUserId(req), audience);
      res.status(200).json({ count });
    },

    read: async (req: Request, res: Response): Promise<void> => {
      const notification = await notificationService.markRead(
        requireUserId(req),
        audience,
        requireParam(req, 'id'),
      );
      res.status(200).json({ notification });
    },

    readAll: async (req: Request, res: Response): Promise<void> => {
      const result = await notificationService.markAllRead(requireUserId(req), audience);
      res.status(200).json(result);
    },

    remove: async (req: Request, res: Response): Promise<void> => {
      await notificationService.deleteNotification(
        requireUserId(req),
        audience,
        requireParam(req, 'id'),
      );
      res.status(200).json({ success: true });
    },
  };
}

export const userNotifications = handlers('user');
export const adminNotifications = handlers('admin');
