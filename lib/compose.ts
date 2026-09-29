// Composition root: the one place concrete adapters are wired (ARCHITECTURE §4.1).

import { fixedClock, type FixedClock } from './adapters/clock'
import { seqIds, type SeqIds } from './adapters/ids'
import { memoryAuth, type MemoryAuth } from './adapters/memory/auth'
import { MemoryUnitOfWork } from './adapters/memory/db'
import type { AppDeps, Config } from './app/ports'
import { serverConfig, type EnvConfig } from './config'
import type { Actor } from './domain/actor'
import { instant } from './domain/time'

export type { AppDeps }

/** The slice of the environment that use cases see. */
export const appConfig = (env: EnvConfig): Config => ({ setupToken: env.setupToken })

/** The signed-in user a request acts for. */
export type RequestSession = { readonly actor: Actor }

const notWiredYet = (): never => {
  throw new Error('The Postgres UnitOfWork is wired in T08.')
}

export const depsForRequest = (_session: RequestSession): AppDeps => {
  appConfig(serverConfig())
  return notWiredYet()
}

/** Scheduled jobs: same use cases, acting as Roomies (the system actor). */
export const depsForJob = (): AppDeps => {
  appConfig(serverConfig())
  return notWiredYet()
}

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
