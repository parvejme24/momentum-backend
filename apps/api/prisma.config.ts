import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const root = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(root, '../../.env') });

/** Neon pooled hosts are `ep-…-pooler.…`. Prisma migrate needs the unpooled host. */
function withoutNeonPooler(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('-pooler.')) {
      parsed.hostname = parsed.hostname.replace('-pooler.', '.');
    }
    return parsed.toString();
  } catch {
    return url.replace('-pooler.', '.');
  }
}

function migrateUrl(): string {
  const url =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

  const isMigrate = process.argv.some((arg) => arg === 'migrate');
  return isMigrate ? withoutNeonPooler(url) : url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=../../.env prisma/seed.ts',
  },
  datasource: {
    // Generate can run without a live DB. Migrate/Studio still use DIRECT_URL when set.
    url: migrateUrl(),
  },
});
