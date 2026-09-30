import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import { DEFAULT_FEELING_WEIGHTS } from '../domain/feelings'
import type { UserId } from '../domain/ids'
import { sampleHouse } from '../testing/sample-house'
import { makeEditContact, makeRemoveContact } from './contacts'
import {
  makeDeleteAccount,
  makeMoveOut,
  makeMoveRoom,
  makeRenameRoom,
  makeSetFeelingWeights,
  makeSetRole,
} from './house'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => {
    const r = await deps.auth.createUser(`p${deps.ids.count()}@example.test`)
    return r.ok ? r.value : Promise.reject(new Error(r.error))
  })
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const member = (u: UserId) => deps.uow.state.members.get(`${s.house.id}|${u}`)!
  return { deps, s, as, member }
}

describe('moving out and removing', () => {
  it('a member moves themselves out and the house hears about it', async () => {
    const { deps, s, as, member } = await setup()
    const r = await makeMoveOut(deps)(as('Sam'), { userId: s.people.Sam })
    expect(r.ok).toBe(true)
    expect(member(s.people.Sam).status.active).toBe(false)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'member.moved_out',
      memberId: s.people.Sam,
    })
  })

  it('an admin removes someone; a member cannot', async () => {
    const { deps, s, as, member } = await setup()
    expect(await makeMoveOut(deps)(as('Sam'), { userId: s.people.Wren })).toEqual({
      ok: false,
      error: 'not_allowed',
    })
    expect(
      await makeMoveOut(deps)(as('Kavya'), { userId: s.people.Wren, note: 'Moved to Denver' }),
    ).toMatchObject({ ok: true })
    expect(member(s.people.Wren).status.active).toBe(false)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'member.removed',
      note: 'Moved to Denver',
    })
  })

  it('the only admin can hand over, then leave', async () => {
    const { deps, s, as } = await setup()
    expect(await makeMoveOut(deps)(as('Kavya'), { userId: s.people.Kavya })).toEqual({
      ok: false,
      error: 'last_admin',
    })
    expect(
      await makeSetRole(deps)(as('Kavya'), { userId: s.people.Jo, role: 'admin' }),
    ).toMatchObject({ ok: true })
    expect(await makeMoveOut(deps)(as('Kavya'), { userId: s.people.Kavya })).toMatchObject({
      ok: true,
    })
  })
})

describe('delete my account', () => {
  it('moves me out, keeps an anonymous profile, and deletes my sign-in', async () => {
    const { deps, s, as, member } = await setup()
    expect(await makeDeleteAccount(deps)(as('Wren'))).toEqual({ ok: true, value: undefined })
    expect(member(s.people.Wren).status.active).toBe(false)
    expect(deps.uow.state.profiles.get(s.people.Wren)).toMatchObject({
      displayName: 'Former roommate',
    })
    expect(deps.uow.state.users.has(s.people.Wren)).toBe(false)
  })

  it('refuses for the last admin, deleting nothing', async () => {
    const { deps, s, as, member } = await setup()
    expect(await makeDeleteAccount(deps)(as('Kavya'))).toEqual({ ok: false, error: 'last_admin' })
    expect(member(s.people.Kavya).status.active).toBe(true)
    expect(deps.uow.state.users.has(s.people.Kavya)).toBe(true)
  })
})

describe('rooms and contacts', () => {
  it('renames and reorders rooms', async () => {
    const { deps, s, as } = await setup()
    const renamed = await makeRenameRoom(deps)(as('Jo'), {
      roomId: s.rooms['Craft room']!.id,
      name: 'Studio',
    })
    expect(renamed.ok && renamed.value.name).toBe('Studio')
    const moved = await makeMoveRoom(deps)(as('Jo'), {
      roomId: s.rooms.Kitchen!.id,
      direction: 'up',
    })
    expect(moved.ok && moved.value.map((r) => r.name)).toEqual(['Kitchen', 'Bathroom 2'])
    expect(deps.uow.state.activity.filter((a) => a.kind === 'room.renamed')).toHaveLength(1)
  })

  it('edits and removes contacts', async () => {
    const { deps, s, as } = await setup()
    const edited = await makeEditContact(deps)(as('Sam'), {
      id: s.contacts.super.id,
      patch: { note: 'Texts are best' },
    })
    expect(edited.ok && edited.value.note).toBe('Texts are best')
    expect(await makeRemoveContact(deps)(as('Sam'), s.contacts.landlord.id)).toMatchObject({
      ok: true,
    })
    expect(
      await makeEditContact(deps)(as('Sam'), { id: s.contacts.landlord.id, patch: { name: 'X' } }),
    ).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(deps.uow.state.activity.map((a) => a.kind)).toEqual([
      'contact.edited',
      'contact.removed',
    ])
  })
})

describe('feeling weights', () => {
  it('any member (not just an admin) can change them, and the house hears about it', async () => {
    const { deps, s, as } = await setup()
    const r = await makeSetFeelingWeights(deps)(as('Sam'), {
      ...DEFAULT_FEELING_WEIGHTS,
      anxious: 40,
    })
    expect(r.ok && r.value.settings.feelingWeights.anxious).toBe(40)
    expect(deps.uow.state.houses.get(s.house.id)?.settings.feelingWeights.anxious).toBe(40)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'settings.feeling_weights_changed',
      actorId: s.people.Sam,
      changes: { anxious: [20, 40] },
    })
  })

  it('refuses out-of-range weights and no-op saves without writing anything', async () => {
    const { deps, as } = await setup()
    const before = deps.uow.state.activity.length
    const set = makeSetFeelingWeights(deps)
    expect(await set(as('Sam'), { ...DEFAULT_FEELING_WEIGHTS, anxious: 50 })).toEqual({
      ok: false,
      error: 'out_of_range',
    })
    expect(await set(as('Sam'), DEFAULT_FEELING_WEIGHTS)).toEqual({ ok: false, error: 'no_change' })
    expect(deps.uow.state.activity.length).toBe(before)
  })
})
