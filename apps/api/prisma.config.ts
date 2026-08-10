import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=../../.env prisma/seed.ts',
  },
  datasource: {
    // Neon: direct (non-pooler) URL for Migrate / Studio
    url: env('DIRECT_URL'),
  },
});
