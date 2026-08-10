import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    passWithNoTests: true,
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
