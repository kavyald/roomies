import path from 'node:path'
import { defineConfig } from 'vitest/config'

const alias = { '@': path.resolve(import.meta.dirname) }

// Two projects (TESTING.md §2): `unit` needs nothing; `db` needs local Supabase running.
const DB_TESTS = [
  'supabase/tests/**/*.test.ts',
  'lib/adapters/postgres/**/*.test.ts',
  'lib/adapters/supabase/**/*.test.ts',
]

export default defineConfig({
  resolve: { alias },
  test: {
    // TESTING.md §5: domain ≥95% of lines, use cases ≥90% (UI is covered by the E2E journeys).
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**/*.ts', 'lib/app/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary'],
      thresholds: {
        'lib/domain/**/*.ts': { lines: 95 },
        'lib/app/**/*.ts': { lines: 90 },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['node_modules/**', '.claude/**', '.next/**', 'e2e/**', ...DB_TESTS],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: DB_TESTS,
          globalSetup: ['lib/testing/db-global-setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
