import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { createRedisClient } from './lib/redis.js';

export async function setupSocket(httpServer: HttpServer): Promise<Server> {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
  });

  const pubClient = createRedisClient();
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.ping(), subClient.ping()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO ready');
  return io;
}
