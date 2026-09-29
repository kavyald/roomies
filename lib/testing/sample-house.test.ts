import { describe, expect, it } from 'vitest'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { sampleHouse } from './sample-house'

describe('sampleHouse', () => {
  it("builds the mockup's house: four roommates in their elemental bedrooms, 17 rooms, 2 contacts", async () => {
    const deps = depsForTest()
    const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
    const r = deps.uow.state
    expect(r.members.size).toBe(4)
    expect(r.rooms.size).toBe(17)
    expect(r.contacts.size).toBe(2)
    const wren = [...r.members.values()].find((m) => m.userId === s.people.Wren)!
    expect(wren.roomId).toBe(s.rooms.Water!.id)
    expect([...r.members.values()].filter((m) => m.role === 'admin').map((m) => m.userId)).toEqual([
      s.people.Kavya,
    ])
  })
})
