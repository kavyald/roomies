import { describe, expect, it } from 'vitest'
import { AccessDenied } from './ports'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { makeSetupHouse, makeSetupStatus } from './setup'

const TOKEN = 'test-setup-token-0123456789abcdef0123'
const input = { houseName: 'The apartment', timezone: 'America/New_York', ownerName: 'Kavya' }

const setup = () => {
  const deps = depsForTest()
  const user = () => deps.ids.newId<'user'>() as UserId
  return { deps, user, setupHouse: makeSetupHouse(deps), status: makeSetupStatus(deps) }
}

describe('house setup', () => {
  it('the owner creates the house once, and a second attempt is rejected', async () => {
    const { deps, user, setupHouse, status } = setup()
    const owner = user()
    expect(await status(TOKEN)).toBe('available')

    const first = await setupHouse(owner, TOKEN, input)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const s = deps.uow.state
    expect(s.houses.size).toBe(1)
    expect(s.rooms.size).toBe(17)
    expect([...s.members.values()]).toEqual([
      expect.objectContaining({ userId: owner, role: 'admin' }),
    ])
    expect(s.profiles.get(owner)?.displayName).toBe('Kavya')
    expect(s.activity.map((a) => a.kind)).toEqual(['house.created'])

    expect(await status(TOKEN)).toBe('already_set_up')
    expect(await setupHouse(owner, TOKEN, input)).toEqual({ ok: false, error: 'already_set_up' })
    expect(await setupHouse(user(), TOKEN, input)).toEqual({ ok: false, error: 'already_set_up' })
    expect(s.houses.size).toBe(1)
  })

  it('needs the right token', async () => {
    const { user, setupHouse, status } = setup()
    expect(await status('nope')).toBe('invalid_token')
    expect(await setupHouse(user(), 'nope', input)).toEqual({ ok: false, error: 'invalid_token' })
  })

  it('writes nothing when the input is incomplete', async () => {
    const { deps, user, setupHouse } = setup()
    expect(await setupHouse(user(), TOKEN, { ...input, houseName: ' ' })).toEqual({
      ok: false,
      error: 'empty_house_name',
    })
    expect(deps.uow.state.houses.size).toBe(0)
    expect(deps.uow.state.profiles.size).toBe(0)
  })

  it("only the house's creator can claim it, and only while it has no members", async () => {
    const { deps, user, setupHouse } = setup()
    const owner = user()
    const r = await setupHouse(owner, TOKEN, input)
    if (!r.ok) throw new Error(r.error)
    const intruder = user()
    await expect(
      deps.uow.run({ kind: 'user', userId: intruder }, (repos) =>
        repos.members.save({
          houseId: r.value.id,
          userId: intruder,
          role: 'admin',
          joinedAt: deps.clock.now(),
          status: { active: true },
        }),
      ),
    ).rejects.toBeInstanceOf(AccessDenied)
  })
})
