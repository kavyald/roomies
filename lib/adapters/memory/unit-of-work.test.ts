import { describe, expect, it } from 'vitest'
import { seqIds } from '../ids'
import { unitOfWorkContract } from '../contracts/unit-of-work.contract'
import { MemoryUnitOfWork } from './db'
import { defaultHouseSettings, type House } from '../../domain/house'
import { AccessDenied } from '../../app/ports'
import { instant } from '../../domain/time'
import type { UserId } from '../../domain/ids'

const harness = async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => {
      const id = ids.newId<'user'>() as UserId
      uow.addUser(id, `${id}@example.test`)
      return id
    },
    activity: async (houseId: House['id']) =>
      uow.state.activity.filter((r) => r.houseId === houseId),
  }
}

unitOfWorkContract('memory', harness)

describe('memory UnitOfWork: first house', () => {
  it('lets the first account create the only house, once', async () => {
    const { uow, ids, createUser } = await harness()
    const owner = await createUser()
    const house = (): House => ({
      id: ids.newId(),
      name: 'Home',
      settings: defaultHouseSettings('America/New_York'),
      createdBy: owner,
      createdAt: instant(0),
    })
    const first = house()
    const actor = { kind: 'member', userId: owner, houseId: first.id } as const
    await uow.run(actor, (r) => r.houses.save(first))
    const second = house()
    await expect(
      uow.run({ ...actor, houseId: second.id }, (r) => r.houses.save(second)),
    ).rejects.toBeInstanceOf(AccessDenied)
  })
})
