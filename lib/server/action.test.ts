import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AccessDenied } from '../app/ports'
import { depsForTest } from '../compose'
import type { HouseActor } from '../domain/actor'
import type { HouseId, UserId } from '../domain/ids'
import { ok } from '../domain/result'
import { makeAction } from './action'

const actor: HouseActor = { kind: 'member', userId: 'u1' as UserId, houseId: 'h1' as HouseId }
const schema = z.object({ n: z.number() })
const env = (overrides = {}) => ({
  currentActor: async () => actor,
  deps: () => depsForTest(),
  log: vi.fn(),
  ...overrides,
})

describe('makeAction', () => {
  it('passes parsed input and the actor to the use case', async () => {
    const run = vi.fn(async (_d, a: HouseActor, input: { n: number }) =>
      ok({ doubled: input.n * 2, by: a.kind }),
    )
    expect(await makeAction(schema, run, env())({ n: 21 })).toEqual(
      ok({ doubled: 42, by: 'member' }),
    )
  })

  it('rejects bad input before doing anything', async () => {
    const run = vi.fn()
    expect(await makeAction(schema, run, env())({ n: 'nope' })).toEqual({
      ok: false,
      error: 'invalid_input',
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('needs someone signed in', async () => {
    const act = makeAction(schema, vi.fn(), env({ currentActor: async () => null }))
    expect(await act({ n: 1 })).toEqual({ ok: false, error: 'not_signed_in' })
  })

  it('maps access denials and hides unexpected errors', async () => {
    const denied = makeAction(
      schema,
      async () => {
        throw new AccessDenied('rls')
      },
      env(),
    )
    expect(await denied({ n: 1 })).toEqual({ ok: false, error: 'not_allowed' })
    const e = env()
    const boom = makeAction(
      schema,
      async () => {
        throw new Error('relation "x" does not exist')
      },
      e,
    )
    expect(await boom({ n: 1 })).toEqual({ ok: false, error: 'unexpected' })
    expect(e.log).toHaveBeenCalled()
  })
})
