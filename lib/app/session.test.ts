import { describe, expect, it } from 'vitest'
import { seedHouse, system } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { makeWhereTo } from './session'

const setup = async () => {
  const deps = depsForTest()
  const seeded = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  return { deps, ...seeded, whereTo: makeWhereTo(deps) }
}

describe('whereTo', () => {
  it('sends a member to their house', async () => {
    const { house, member, whereTo } = await setup()
    expect(await whereTo(member)).toEqual({ to: 'house', houseId: house.id })
  })

  it('tells someone who moved out', async () => {
    const { deps, house, member, whereTo } = await setup()
    await deps.uow.run(system(house.id), async (r) => {
      const m = await r.members.get(house.id, member)
      await r.members.save({ ...m!, status: { active: false, leftAt: deps.clock.now() } })
    })
    expect(await whereTo(member)).toEqual({ to: 'moved_out' })
  })

  it('knows when someone has no house', async () => {
    const { deps, whereTo } = await setup()
    expect(await whereTo(deps.ids.newId<'user'>() as UserId)).toEqual({ to: 'no_house' })
  })
})
