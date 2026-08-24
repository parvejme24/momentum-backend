import process from 'node:process';

process.stdout.write('Momentum worker is running\n');

const keepAlive = setInterval(() => undefined, 60_000);

function shutdown(signal: string): void {
  process.stdout.write(`Momentum worker shutting down (${signal})\n`);
  clearInterval(keepAlive);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
