import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'api',
          include: ['apps/api/**/*.test.ts', 'packages/**/*.test.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
          restoreMocks: true,
          // retention.ts takes a database-wide PostgreSQL advisory lock
          // (RETENTION_LOCK = 778899125). Test schemas isolate tables, not
          // advisory locks, so concurrent API files sharing one database can
          // make purgeExpiredEvents see contention and return { purged: 0 }.
          // Serialize API test files only; the web project stays parallel.
          fileParallelism: false,
        },
      },
      'apps/web/vitest.config.ts',
    ],
  },
});
