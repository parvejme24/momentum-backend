import type { AuthStatus } from '../lib/auth-cache.js';
import type { Habit } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: 'CUSTOMER' | 'ADMIN';
      authStatus?: AuthStatus;
      habit?: Habit;
    }
  }
}

export {};
