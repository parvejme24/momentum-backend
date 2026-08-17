import type { Habit } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: 'CUSTOMER' | 'ADMIN';
      habit?: Habit;
    }
  }
}

export {};
