import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, type Socket } from 'socket.io';
import { isAllowedOrigin } from './lib/cors-origins.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createRedisClient } from './lib/redis.js';
import { verifyAccessToken } from './lib/jwt.js';
import { setIo } from './lib/realtime.js';
import { unreadCount } from './modules/notification/notification.service.js';

type SocketAuth = {
  userId: string;
  role: 'CUSTOMER' | 'ADMIN';
};

function socketAuth(socket: Socket): SocketAuth {
  const data = socket.data as Partial<SocketAuth>;
  if (typeof data.userId !== 'string' || (data.role !== 'CUSTOMER' && data.role !== 'ADMIN')) {
    throw new Error('UNAUTHORIZED');
  }
  return { userId: data.userId, role: data.role };
}

export async function setupSocket(httpServer: HttpServer): Promise<Server> {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    },
  });

  const pubClient = createRedisClient({ enableOfflineQueue: true });
  const subClient = pubClient.duplicate();

  try {
    await Promise.race([
      Promise.all([pubClient.ping(), subClient.ping()]),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis ping timed out')), 4000);
      }),
    ]);
    io.adapter(createAdapter(pubClient, subClient));
  } catch (err) {
    logger.error({ err }, 'Redis adapter unavailable; Socket.IO will run on this instance only');
  }

  io.use((socket, next) => {
    void (async () => {
      const raw =
        (typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : '') ||
        (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : '') ||
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization
          : '');

      const token = raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : raw.trim();
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, bannedAt: null },
        select: { id: true, role: true },
      });

      if (!user) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      socket.data = { userId: user.id, role: user.role } satisfies SocketAuth;
      next();
    })().catch(() => {
      next(new Error('UNAUTHORIZED'));
    });
  });

  io.on('connection', (socket) => {
    let auth: SocketAuth;
    try {
      auth = socketAuth(socket);
    } catch {
      socket.disconnect(true);
      return;
    }

    void socket.join(`user:${auth.userId}`);
    if (auth.role === 'ADMIN') {
      void socket.join('admins');
    }

    logger.debug({ socketId: socket.id, userId: auth.userId }, 'Socket connected');

    void Promise.all([unreadCount(auth.userId, 'user'), unreadCount(auth.userId, 'admin')]).then(
      ([userCount, adminCount]) => {
        socket.emit('notification:unread', { audience: 'user', count: userCount });
        if (auth.role === 'ADMIN') {
          socket.emit('notification:unread', { audience: 'admin', count: adminCount });
        }
      },
    );

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, userId: auth.userId, reason }, 'Socket disconnected');
    });
  });

  setIo(io);
  logger.info('Socket.IO ready');
  return io;
}
