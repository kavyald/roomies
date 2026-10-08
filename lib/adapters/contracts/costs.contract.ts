// The costs repository contract (T29, T57): costs round-trip with what they were for; they're
// recorded in your own name, in your own house, with a positive amount. Any member edits the
// amount, who paid and the note, or removes one; what it was for and who added it never change.

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, ConstraintViolation } from '../../app/ports'
import type { Cost } from '../../domain/costs'
import type { Cents } from '../../domain/money'
import type { Batch } from '../../domain/runs'
import { instant } from '../../domain/time'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))

export const costsContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Costs contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const { house, admin, member } = seeded
      const run: Batch = {
        id: h.ids.newId(),
        houseId: house.id,
        kind: 'batch',
        runner: member,
        createdBy: member,
        createdAt: T,
        state: { open: true },
      }
      await h.uow.run(system(house.id), (r) => r.runs.save(run))
      const cost = (o: Partial<Cost> = {}): Cost => ({
        id: h.ids.newId(),
        houseId: house.id,
        amount: 4250 as Cents,
        paidBy: admin,
        createdBy: member,
        createdAt: T,
        ...o,
      })
      const me = asMember(house.id, member)
      return { ...seeded, run, cost, me }
    }

    it('round-trips costs for a run, for nothing, and with a note', async () => {
      const s = await setup()
      const costs = [
        s.cost({ for: { run: s.run.id }, note: 'Groceries' }),
        s.cost({ amount: 1 as Cents }),
      ]
      await h.uow.run(s.me, async (r) => {
        for (const c of costs) await r.costs.add(c)
      })
      const back = await h.uow.run(s.me, (r) => r.costs.listByHouse(s.house.id))
      expect(back.sort((a, b) => a.amount - b.amount)).toEqual(
        [...costs].sort((a, b) => a.amount - b.amount),
      )
    })

    it('in your own name and house, with a positive amount, for a run that exists', async () => {
      const s = await setup()
      await expect(
        h.uow.run(s.me, (r) => r.costs.add(s.cost({ createdBy: s.admin }))),
      ).rejects.toBeInstanceOf(AccessDenied)
      const other = await setup()
      await expect(
        h.uow.run(s.me, (r) => r.costs.add(s.cost({ houseId: other.house.id }))),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(s.me, (r) => r.costs.add(s.cost({ amount: 0 as Cents }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(
        h.uow.run(s.me, (r) => r.costs.add(s.cost({ for: { run: h.ids.newId() } }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      expect(
        await h.uow.run(asMember(other.house.id, other.member), (r) =>
          r.costs.listByHouse(s.house.id),
        ),
      ).toEqual([])
    })

    it('a member edits the amount, who paid and the note, and removes it; the rest stays', async () => {
      const s = await setup()
      const c = s.cost({ for: { run: s.run.id }, note: 'Groceries' })
      await h.uow.run(s.me, (r) => r.costs.add(c))
      const asAdmin = asMember(s.house.id, s.admin)
      const edited: Cost = { ...c, amount: 5000 as Cents, paidBy: s.member, note: undefined }
      await h.uow.run(asAdmin, (r) =>
        r.costs.update({ ...edited, createdBy: s.admin, createdAt: instant(0), for: undefined }),
      )
      const { note: _n, ...expected } = edited
      expect(await h.uow.run(s.me, (r) => r.costs.get(c.id))).toEqual(expected)
      await h.uow.run(asAdmin, (r) => r.costs.update({ ...edited, removedAt: T }))
      expect(await h.uow.run(s.me, (r) => r.costs.get(c.id))).toEqual({ ...expected, removedAt: T })
      expect(await h.uow.run(s.me, (r) => r.costs.listByHouse(s.house.id))).toHaveLength(1)
      await expect(
        h.uow.run(asAdmin, (r) => r.costs.update({ ...edited, amount: 0 as Cents })),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })

    it("another house can't read or change a cost", async () => {
      const s = await setup()
      const c = s.cost()
      await h.uow.run(s.me, (r) => r.costs.add(c))
      const other = await setup()
      const stranger = asMember(other.house.id, other.member)
      expect(await h.uow.run(stranger, (r) => r.costs.get(c.id))).toBeUndefined()
      await h.uow.run(stranger, (r) => r.costs.update({ ...c, amount: 1 as Cents, removedAt: T }))
      expect(await h.uow.run(s.me, (r) => r.costs.get(c.id))).toEqual(c)
    })
  })
