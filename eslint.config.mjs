import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import boundaries from 'eslint-plugin-boundaries'

// ---- Layers (ARCHITECTURE §4.1) -------------------------------------------------------
// domain ← app (use cases + ports) ← adapters ← compose. Entry points (app/, components/)
// reach use cases through compose, and the UI reads through lib/client.

const TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.contract.ts',
  'e2e/**',
  'supabase/tests/**',
]

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
})

const layers = {
  plugins: { boundaries },
  settings: {
    'import/resolver': { typescript: { alwaysTryTypes: true } },
    'boundaries/include': ['lib/**', 'app/**', 'components/**'],
    'boundaries/elements': [
      { type: 'domain', pattern: 'lib/domain/**', partialMatch: false },
      { type: 'app', pattern: 'lib/app/**', partialMatch: false },
      { type: 'adapters', pattern: 'lib/adapters/**', partialMatch: false },
      { type: 'schemas', pattern: 'lib/schemas/**', partialMatch: false },
      { type: 'client', pattern: 'lib/client/**', partialMatch: false },
      { type: 'testing', pattern: 'lib/testing/**', partialMatch: false },
      { type: 'ui', pattern: ['app/**', 'components/**'], partialMatch: false },
    ],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'disallow',
        message: 'This import crosses a layer boundary (see ARCHITECTURE §4.1).',
        policies: [
          allow('domain', ['domain']),
          allow('app', ['domain', 'app']),
          allow('adapters', ['domain', 'app', 'adapters']),
          allow('schemas', ['domain', 'schemas']),
          allow('client', ['domain', 'app', 'schemas', 'client']),
          allow('ui', ['domain', 'app', 'schemas', 'client', 'ui']),
          allow('testing', ['domain', 'app', 'adapters', 'client', 'testing']),
        ],
      },
    ],
  },
}

// Tests may reach any layer (to build fakes and fixtures).
const testsReachEverything = {
  files: TEST_FILES,
  rules: { 'boundaries/dependencies': 'off' },
}

// ---- Imports that aren't layer-to-layer -------------------------------------------------
// ESLint keeps only the last matching config for a rule, so each file group gets exactly one
// `no-restricted-imports` entry built from these pieces.

const INFRA =
  'Only lib/adapters and lib/compose.ts may use Supabase, Kysely, pg, web-push, Sentry, or @vercel/functions.'
const infraPackages = [
  {
    group: [
      '@supabase/*',
      'kysely',
      'kysely/*',
      'pg',
      'pg/*',
      'web-push',
      '@sentry/*',
      '@sentry/*/*',
      '@vercel/functions',
      '@vercel/functions/*',
    ],
    message: INFRA,
  },
]
const noTesting = [
  {
    group: ['**/testing', '**/testing/*', '@/lib/testing', '@/lib/testing/*'],
    message: 'lib/testing is for tests only.',
  },
]
const noCompose = [
  {
    group: ['**/compose', '@/lib/compose'],
    message: 'Only entry points (app/, instrumentation.ts) use the composition root.',
  },
]
const noConfig = [
  {
    group: ['**/config', '@/lib/config'],
    message: 'Config is injected; only compose and entry points load it.',
  },
]
const packagesBanned = [
  {
    regex: '^(?!\\.{1,2}/)',
    message: 'lib/domain and lib/app import no packages (and no aliases), only relative modules.',
  },
]

const restrict = (files, patterns, ignores = []) => ({
  files,
  ignores: [...TEST_FILES, ...ignores],
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

const importRules = [
  // Everything outside the groups below: no infra packages, no test helpers.
  restrict(
    ['**/*.{ts,tsx}'],
    [...infraPackages, ...noTesting],
    // next.config.ts wraps the build with Sentry's plugin (source maps, the tunnel route).
    [
      'lib/adapters/**',
      'lib/compose.ts',
      'lib/compose.client.ts',
      'lib/testing/**',
      'next.config.ts',
    ],
  ),
  // The domain and use cases: plain TypeScript.
  restrict(
    ['lib/domain/**/*.ts', 'lib/app/**/*.ts'],
    [...packagesBanned, ...noCompose, ...noConfig],
  ),
  // Adapters get config injected and never reach the composition root.
  restrict(['lib/adapters/**/*.ts'], [...noTesting, ...noCompose, ...noConfig]),
  // The UI's data layer and shared schemas.
  restrict(
    ['lib/client/**/*.{ts,tsx}', 'lib/schemas/**/*.ts'],
    [...infraPackages, ...noTesting, ...noCompose, ...noConfig],
  ),
]

// ---- No hidden side effects in domain and app code -------------------------------------

const noHiddenSideEffects = {
  files: ['lib/domain/**/*.ts', 'lib/app/**/*.ts'],
  ignores: TEST_FILES,
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
        message: 'Inject a Clock instead of calling new Date().',
      },
      {
        selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
        message: 'Inject a Clock instead of calling Date.now().',
      },
      {
        selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
        message: 'Inject an IdGenerator instead of using Math.random().',
      },
      {
        selector: 'CallExpression[callee.property.name="randomUUID"]',
        message: 'Inject an IdGenerator instead of calling randomUUID().',
      },
    ],
  },
}

// Only lib/config.ts reads the environment.
const envOnlyInConfig = {
  files: ['**/*.{ts,tsx}'],
  ignores: [
    'lib/config.ts',
    'lib/testing/**',
    ...TEST_FILES,
    '*.config.{ts,mts}',
    'playwright.config.ts',
    'scripts/**',
  ],
  rules: {
    'no-restricted-properties': [
      'error',
      { object: 'process', property: 'env', message: 'Only lib/config.ts reads process.env.' },
    ],
  },
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  layers,
  testsReachEverything,
  ...importRules,
  noHiddenSideEffects,
  envOnlyInConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores([
    '.claude/**',
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'docs/**',
  ]),
])
