import path from 'node:path'
import { defineConfig } from 'vitest/config'

const alias = { '@': path.resolve(import.meta.dirname) }

// Two projects (TESTING.md §2): `unit` needs nothing; `db` needs local Supabase running.
const DB_TESTS = ['supabase/tests/**/*.test.ts', 'lib/adapters/postgres/**/*.test.ts']

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['node_modules/**', '.next/**', 'e2e/**', ...DB_TESTS],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: DB_TESTS,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
