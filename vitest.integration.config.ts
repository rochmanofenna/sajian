// Separate vitest config for integration tests. The `npm test` loop
// stays fast (~1s, 194 unit tests); integration is a separate
// invocation (~2-3 min) gated to PR + nightly CI.
//
// Run via: npm run test:integration

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Real DB latency means tests take seconds, not milliseconds. Bump
    // the timeout so a CI cold-start doesn't false-fail.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Sequential — every test file runs seedFixtures() in beforeAll
    // and we don't want two suites racing against the same tables.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    passWithNoTests: false,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
