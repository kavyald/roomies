import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

// Domain and app code never read the clock or make random ids; both are injected (ARCHITECTURE §4.1).
const noHiddenSideEffects = {
  files: ['lib/domain/**/*.ts', 'lib/app/**/*.ts'],
  ignores: ['**/*.test.ts'],
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
    'no-restricted-globals': [
      'error',
      { name: 'process', message: 'Only lib/config.ts reads process.env.' },
    ],
  },
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  noHiddenSideEffects,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'docs/**']),
])
