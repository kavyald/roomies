import { describe, expect, it } from 'vitest'
import { AccessDenied } from './ports'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { SETUP_RATE } from './invites'
import { makeSetupHouse, makeSetupStatus, makeStartSetup } from './setup'

const TOKEN = 'test-setup-token-0123456789abcdef0123'
const IP = '203.0.113.9'
const input = { houseName: 'The apartment', timezone: 'America/New_York', ownerName: 'Kavya' }

const setup = () => {
  const deps = depsForTest()
  const user = () => deps.ids.newId<'user'>() as UserId
  return {
    deps,
    user,
    setupHouse: makeSetupHouse(deps),
    status: makeSetupStatus(deps),
    start: makeStartSetup(deps),
  }
}

describe('house setup', () => {
  it('the owner creates the house once, and a second attempt is rejected', async () => {
    const { deps, user, setupHouse, status } = setup()
    const owner = user()
    expect(await status(IP, TOKEN)).toBe('available')

    const first = await setupHouse(IP, owner, TOKEN, input)
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

    expect(await status(IP, TOKEN)).toBe('already_set_up')
    expect(await setupHouse(IP, owner, TOKEN, input)).toEqual({
      ok: false,
      error: 'already_set_up',
    })
    expect(await setupHouse(IP, user(), TOKEN, input)).toEqual({
      ok: false,
      error: 'already_set_up',
    })
    expect(s.houses.size).toBe(1)
  })

  it('needs the right token, and logs each wrong one', async () => {
    const { deps, user, setupHouse, status, start } = setup()
    expect(await status(IP, 'nope')).toBe('invalid_token')
    expect(await start(IP, 'nope', 'me@example.test')).toEqual({
      ok: false,
      error: 'invalid_token',
    })
    expect(await setupHouse(IP, user(), 'nope', input)).toEqual({
      ok: false,
      error: 'invalid_token',
    })
    const at = deps.clock.now()
    expect(deps.securityLog.events).toEqual([
      { kind: 'setup_token_refused', step: 'setup.view', ip: IP, at },
      { kind: 'setup_token_refused', step: 'setup.start', ip: IP, at },
      { kind: 'setup_token_refused', step: 'setup.finish', ip: IP, at },
    ])
    expect(deps.auth.sentCodes).toEqual([])
  })

  it('starts with a code while no house exists, and logs nothing for the right token', async () => {
    const { deps, user, setupHouse, start } = setup()
    expect(await start(IP, TOKEN, 'me@example.test')).toEqual({ ok: true, value: undefined })
    expect(deps.auth.sentCodes).toEqual(['me@example.test'])
    await setupHouse(IP, user(), TOKEN, input)
    expect(await start(IP, TOKEN, 'me@example.test')).toEqual({
      ok: false,
      error: 'already_set_up',
    })
    expect(deps.securityLog.events).toEqual([])
  })

  it('rate-limits starting setup per IP, logging each refusal', async () => {
    const { deps, start } = setup()
    for (let i = 0; i < SETUP_RATE.limit; i++) await start(IP, 'nope', 'me@example.test')
    expect(await start(IP, TOKEN, 'me@example.test')).toEqual({ ok: false, error: 'rate_limited' })
    expect(await start(IP, TOKEN, 'me@example.test')).toEqual({ ok: false, error: 'rate_limited' })
    expect(deps.securityLog.events.map((e) => e.kind)).toEqual([
      ...Array<string>(SETUP_RATE.limit).fill('setup_token_refused'),
      'rate_limited',
      'rate_limited',
    ])
    expect(await start('198.51.100.1', TOKEN, 'me@example.test')).toEqual({
      ok: true,
      value: undefined,
    })
  })

  it('writes nothing when the input is incomplete', async () => {
    const { deps, user, setupHouse } = setup()
    expect(await setupHouse(IP, user(), TOKEN, { ...input, houseName: ' ' })).toEqual({
      ok: false,
      error: 'empty_house_name',
    })
    expect(deps.uow.state.houses.size).toBe(0)
    expect(deps.uow.state.profiles.size).toBe(0)
  })

  it("only the house's creator can claim it, and only while it has no members", async () => {
    const { deps, user, setupHouse } = setup()
    const owner = user()
    const r = await setupHouse(IP, owner, TOKEN, input)
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
