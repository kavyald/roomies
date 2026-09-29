// Composition root: the one place concrete adapters are wired (ARCHITECTURE §4.1).
// T06 adds the ports and in-memory adapters; T08 wires Postgres.

import { serverConfig, type Config } from './config'
import type { Actor } from './domain/actor'

export type AppDeps = {
  readonly config: Config
}

/** The signed-in user a request acts for. */
export type RequestSession = { readonly actor: Actor }

export const depsForRequest = (_session: RequestSession): AppDeps => ({ config: serverConfig() })

/** Scheduled jobs: same use cases, acting as Roomies (the system actor). */
export const depsForJob = (): AppDeps => ({ config: serverConfig() })

export const testConfig: Config = {
  databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseServiceRoleKey: 'test-service-role-key',
  setupToken: 'test-setup-token-0123456789abcdef0123',
  public: { supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: 'test-anon-key' },
}

/** In-memory adapters and a fixed clock, never the environment. */
export const depsForTest = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  config: testConfig,
  ...overrides,
})
