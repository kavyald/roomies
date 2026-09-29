// Composition root: the one place concrete adapters are wired (ARCHITECTURE §4.1).

import type { Kysely } from 'kysely'
import { fixedClock, systemClock, type FixedClock } from './adapters/clock'
import { cryptoIds, seqIds, type SeqIds } from './adapters/ids'
import { memoryAuth, type MemoryAuth } from './adapters/memory/auth'
import { MemoryUnitOfWork } from './adapters/memory/db'
import type { DB } from './adapters/postgres/schema'
import { createDb, PostgresUnitOfWork } from './adapters/postgres/unit-of-work'
import { supabaseAuthGateway } from './adapters/supabase/auth-gateway'
import { adminClient, anonClient } from './adapters/supabase/server'
import type { AppDeps, AuthGateway, Config } from './app/ports'
import { serverConfig, type EnvConfig } from './config'
import type { Actor } from './domain/actor'
import { instant } from './domain/time'

export type { AppDeps }

/** The slice of the environment that use cases see. */
export const appConfig = (env: EnvConfig): Config => ({ setupToken: env.setupToken })

/** The signed-in user a request acts for. */
export type RequestSession = { readonly actor: Actor }

let db: Kysely<DB> | undefined

/** One connection pool per server process. */
const database = (env: EnvConfig): Kysely<DB> => (db ??= createDb(env.databaseUrl))

let auth: AuthGateway | undefined

/** Supabase Auth, via the service role (create/delete users) and anon (send codes). */
const authGateway = (env: EnvConfig): AuthGateway =>
  (auth ??= supabaseAuthGateway(
    adminClient(env.supabaseUrl, env.supabaseServiceRoleKey),
    anonClient(env.supabaseUrl, env.public.supabaseAnonKey),
  ))

/** For entry points that act before anyone is signed in (sending a sign-in code). */
export const authForRequest = (): AuthGateway => authGateway(serverConfig())

const productionDeps = (env: EnvConfig): AppDeps => ({
  uow: new PostgresUnitOfWork(database(env)),
  clock: systemClock,
  ids: cryptoIds,
  auth: authGateway(env),
  config: appConfig(env),
})

/** A request from a signed-in user. Use cases take the actor per call; RLS applies to it. */
export const depsForRequest = (_session: RequestSession): AppDeps => productionDeps(serverConfig())

/** Scheduled jobs: same use cases, called with the system actor (service_role in Postgres). */
export const depsForJob = (): AppDeps => productionDeps(serverConfig())

export type TestDeps = AppDeps & {
  readonly uow: MemoryUnitOfWork
  readonly clock: FixedClock
  readonly ids: SeqIds
  readonly auth: MemoryAuth
}

export const TEST_NOW = instant(Date.UTC(2026, 8, 29, 16, 0)) // Tue 2026-09-29 12:00 in New York

/** In-memory adapters, a fixed clock and sequential ids; never the environment. */
export const depsForTest = (overrides: Partial<AppDeps> = {}): TestDeps => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    clock: fixedClock(TEST_NOW),
    auth: memoryAuth(uow, ids),
    config: { setupToken: 'test-setup-token-0123456789abcdef0123' },
    ...overrides,
  } as TestDeps
}
