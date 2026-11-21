import { defineConfig } from 'vitest/config'

// Nuxt-independent tests only: no component or Nuxt runtime tests exist yet.
// Files are isolated by default so agents can run just the tests for what they change.
// tests/integration needs a disposable PostgreSQL (`npm run db:up`); see README.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'shared/**/*.test.ts',
      'server/**/*.test.ts',
      'tests/contract/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    // Off by default; enable with `--coverage`. app/ is left out until it has tests.
    coverage: {
      provider: 'v8',
      include: ['{server,shared}/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
