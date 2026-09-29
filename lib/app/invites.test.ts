import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { MS_PER_DAY } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import {
  INVITE_RATE,
  makeAcceptInvite,
  makeCreateInvite,
  makeInviteDetails,
  makeListInvites,
  makeRevokeInvite,
  makeStartInvite,
} from './invites'

const IP = '203.0.113.7'

const setup = async () => {
  const deps = depsForTest()
  // A house where Jo's Earth room is free: three roommates, one open bedroom.
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  await deps.uow.run({ kind: 'system', houseId: s.house.id }, async (r) => {
    const jo = await r.members.get(s.house.id, s.people.Jo)
    await r.members.save({ ...jo!, status: { active: false, leftAt: deps.clock.now() } })
  })
  const admin = asMember(s.house.id, s.people.Kavya)
  const newcomer = async (email: string) => {
    const r = await deps.auth.createUser(email)
    return r.ok ? r.value : Promise.reject(new Error(r.error))
  }
  return {
    deps,
    s,
    admin,
    newcomer,
    create: makeCreateInvite(deps),
    revoke: makeRevokeInvite(deps),
    list: makeListInvites(deps),
    details: makeInviteDetails(deps),
    start: makeStartInvite(deps),
    accept: makeAcceptInvite(deps),
  }
}

describe('invites: a roommate joins from a link', () => {
  it('creates a link, shows who invited, sends a code, and joins with a bedroom', async () => {
    const { deps, s, admin, newcomer, create, details, start, accept } = await setup()
    const made = await create(admin, {})
    if (!made.ok) throw new Error(made.error)
    expect(made.value.invite.maxUses).toBe(1) // one open bedroom
    expect(deps.uow.state.invites.get(made.value.invite.id)!.tokenHash).not.toBe(made.value.token)

    const d = await details(made.value.token)
    expect(d.ok && d.value).toMatchObject({ houseName: 'The apartment', invitedBy: 'Kavya' })
    expect(d.ok && d.value.bedrooms.map((b) => [b.name, b.takenBy])).toEqual([
      ['Air', 'Kavya'],
      ['Fire', 'Sam'],
      ['Water', 'Wren'],
      ['Earth', undefined],
    ])

    expect(await start(IP, made.value.token, 'maya@example.test')).toEqual({
      ok: true,
      value: undefined,
    })
    expect(deps.auth.sentCodes).toEqual(['maya@example.test'])
    const maya = [...deps.uow.state.users].find(([, u]) => u.email === 'maya@example.test')![0]

    const joined = await accept(IP, maya, made.value.token, {
      displayName: 'Maya',
      roomId: s.rooms.Earth!.id,
    })
    expect(joined).toEqual({ ok: true, value: s.house.id })
    const m = deps.uow.state.members.get(`${s.house.id}|${maya}`)!
    expect(m).toMatchObject({ role: 'member', roomId: s.rooms.Earth!.id, status: { active: true } })
    expect(deps.uow.state.invites.get(made.value.invite.id)!.uses).toBe(1)

    // Everyone gets the member.joined entry (members read the house's activity).
    const kinds = deps.uow.state.activity.filter((a) => a.memberId === maya).map((a) => a.kind)
    expect(kinds).toEqual(['member.joined', 'member.room_changed'])

    // The link is now used up.
    const other = await newcomer('late@example.test')
    expect(await accept(IP, other, made.value.token, { displayName: 'Late' })).toEqual({
      ok: false,
      error: 'used_up',
    })
  })

  it('rejects expired, revoked, and unknown links, before sending any code', async () => {
    const { deps, admin, create, revoke, start, details } = await setup()
    const a = await create(admin, { maxUses: 3, ttlDays: 1 })
    const b = await create(admin, { maxUses: 3 })
    if (!a.ok || !b.ok) throw new Error('create failed')

    expect(await revoke(admin, b.value.invite.id)).toMatchObject({ ok: true })
    expect(await start(IP, b.value.token, 'x@example.test')).toEqual({
      ok: false,
      error: 'revoked',
    })

    deps.clock.advance(MS_PER_DAY)
    expect(await start(IP, a.value.token, 'x@example.test')).toEqual({
      ok: false,
      error: 'expired',
    })
    expect(await details('not-a-token')).toEqual({ ok: false, error: 'invalid' })
    expect(deps.auth.sentCodes).toEqual([])
  })

  it('only admins make or revoke links, and admins see the working ones', async () => {
    const { s, admin, create, revoke, list } = await setup()
    const sam = asMember(s.house.id, s.people.Sam)
    expect(await create(sam, {})).toEqual({ ok: false, error: 'not_admin' })
    const made = await create(admin, {})
    if (!made.ok) throw new Error(made.error)
    expect(await revoke(sam, made.value.invite.id)).toEqual({ ok: false, error: 'not_found' })
    expect((await list(admin)).map((i) => i.id)).toEqual([made.value.invite.id])
    await revoke(admin, made.value.invite.id)
    expect(await list(admin)).toEqual([])
    expect(await revoke(admin, made.value.invite.id)).toEqual({
      ok: false,
      error: 'already_revoked',
    })
  })

  it("won't give away a bedroom someone lives in", async () => {
    const { s, admin, newcomer, create, accept } = await setup()
    const made = await create(admin, { maxUses: 2 })
    if (!made.ok) throw new Error(made.error)
    const maya = await newcomer('maya@example.test')
    expect(
      await accept(IP, maya, made.value.token, { displayName: 'Maya', roomId: s.rooms.Fire!.id }),
    ).toEqual({
      ok: false,
      error: 'room_taken',
    })
  })

  it('rate-limits each IP', async () => {
    const { admin, create, start } = await setup()
    const made = await create(admin, {})
    if (!made.ok) throw new Error(made.error)
    for (let i = 0; i < INVITE_RATE.limit; i++) await start(IP, 'a-wrong-token', 'x@example.test')
    // Wrong guesses count too, so even a good token is refused from this IP for now.
    expect(await start(IP, made.value.token, 'x@example.test')).toEqual({
      ok: false,
      error: 'rate_limited',
    })
    expect(await start('198.51.100.1', made.value.token, 'x@example.test')).toEqual({
      ok: true,
      value: undefined,
    })
  })
})
