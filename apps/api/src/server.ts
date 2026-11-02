import { createServer } from 'node:http';
import type { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { startKeepAlive } from './lib/keep-alive.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { setupSocket } from './socket.js';

async function main() {
  const app = createApp();
  const httpServer = createServer(app);

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Momentum API listening');
    startKeepAlive();
  });

  let io: Server | undefined;
  try {
    io = await setupSocket(httpServer);
  } catch (err) {
    logger.error({ err }, 'Socket.IO unavailable; HTTP API is still up');
  }

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down gracefully');

    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (io) {
      const socketServer = io;
      await new Promise<void>((resolve) => {
        void socketServer.close(() => resolve());
      });
    }
    await redis.quit();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
