import { describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import { makeCreateContact } from './contacts'

const setup = async () => {
  const deps = depsForTest()
  const seeded = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => {
      const r = await deps.auth.createUser(`u${deps.ids.count()}@example.test`)
      if (!r.ok) throw new Error(r.error)
      return r.value
    },
    activity: async () => [],
  })
  return { deps, ...seeded, createContact: makeCreateContact(deps) }
}

describe('createContact (sample use case, end to end on memory adapters)', () => {
  it('saves the contact and records contact.created in the same transaction', async () => {
    const { deps, house, member, createContact } = await setup()
    const r = await createContact(asMember(house.id, member), {
      name: '  Super ',
      phone: '(555) 010-2231',
      note: '',
    })
    expect(r).toEqual({
      ok: true,
      value: { id: expect.any(String), houseId: house.id, name: 'Super', phone: '(555) 010-2231' },
    })
    if (!r.ok) return

    const saved = await deps.uow.run(system(house.id), (repos) => repos.contacts.get(r.value.id))
    expect(saved).toEqual(r.value)
    expect(deps.uow.state.activity).toEqual([
      expect.objectContaining({
        kind: 'contact.created',
        contactId: r.value.id,
        actorId: member,
        at: deps.clock.now(),
      }),
    ])
  })

  it('refuses an empty name and writes nothing', async () => {
    const { deps, house, member, createContact } = await setup()
    expect(await createContact(asMember(house.id, member), { name: '   ' })).toEqual({
      ok: false,
      error: 'empty_name',
    })
    expect(deps.uow.state.contacts.size).toBe(0)
    expect(deps.uow.state.activity).toEqual([])
  })

  it("can't add to a house you're not in", async () => {
    const { deps, member, createContact } = await setup()
    const other = await seedHouse({
      uow: deps.uow,
      ids: deps.ids,
      createUser: async () => {
        const r = await deps.auth.createUser(`x${deps.ids.count()}@example.test`)
        return r.ok ? r.value : Promise.reject(new Error(r.error))
      },
      activity: async () => [],
    })
    expect(await createContact(asMember(other.house.id, member), { name: 'Plumber' })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
