// The runs repository contract (T28): round trips for each kind and state, an item on at most one
// run of its own house and of the kind it says, and the access rules.

import { beforeAll, describe, expect, it } from 'vitest'
import { makeEditItem } from '../../app/items'
import { AccessDenied, ConstraintViolation } from '../../app/ports'
import type { Contact } from '../../domain/house'
import type { Need, Task } from '../../domain/items'
import type { Batch, Request, Run, Visit } from '../../domain/runs'
import { instant, type LocalDate, type LocalTime } from '../../domain/time'
import { fixedClock } from '../clock'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))
const LATER = instant(Date.UTC(2026, 8, 30, 16, 0))

export const runsContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Runs contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const { house, member } = seeded
      const landlord: Contact = { id: h.ids.newId(), houseId: house.id, name: 'Landlord' }
      await h.uow.run(system(house.id), (r) => r.contacts.save(landlord))
      const base = { houseId: house.id, runner: member, createdBy: member, createdAt: T }
      const batch = (o: Partial<Batch> = {}): Batch => ({
        ...base,
        id: h.ids.newId(),
        kind: 'batch',
        state: { open: true },
        ...o,
      })
      const request = (state: Request['state'] = { at: 'gathering' }): Request => ({
        ...base,
        id: h.ids.newId(),
        kind: 'request',
        contactId: landlord.id,
        state,
      })
      const visit = (o: Partial<Visit> = {}): Visit => ({
        ...base,
        id: h.ids.newId(),
        kind: 'visit',
        contactId: landlord.id,
        state: { open: true },
        ...o,
      })
      const me = asMember(house.id, member)
      const putRun = (run: Run) => h.uow.run(me, (r) => r.runs.save(run))
      const getRun = (id: Run['id']) => h.uow.run(me, (r) => r.runs.get(id))
      const need = (title: string, o: Partial<Need> = {}): Need => ({
        id: h.ids.newId(),
        houseId: house.id,
        category: 'need',
        title,
        priority: 'normal',
        createdBy: member,
        createdAt: T,
        ...o,
      })
      const task = (title: string, o: Partial<Task> = {}): Task => ({
        ...need(title),
        category: 'task',
        ...o,
      })
      const putItem = (item: Need | Task) => h.uow.run(me, (r) => r.items.save(item))
      return { ...seeded, landlord, batch, request, visit, putRun, getRun, need, task, putItem, me }
    }

    it('round-trips each kind and state, with dates in the house time zone', async () => {
      const s = await setup()
      const runs: Run[] = [
        s.batch({ title: 'Groceries', when: { date: '2026-10-03' as LocalDate } }),
        s.batch({ state: { open: false, finishedAt: LATER } }),
        s.request(),
        s.request({ at: 'sent', sentAt: LATER, via: 'text' }),
        s.request({ at: 'closed', closedAt: LATER }),
        s.visit({ when: { date: '2026-10-02' as LocalDate, time: '10:00' as LocalTime } }),
        s.visit({ state: { open: false, finishedAt: LATER } }),
      ]
      for (const run of runs) await s.putRun(run)
      for (const run of runs) expect(await s.getRun(run.id)).toEqual(run)
      const listed = await h.uow.run(s.me, (r) => r.runs.listByHouse(s.house.id))
      expect(listed.map((r) => r.id).sort()).toEqual(runs.map((r) => r.id).sort())
    })

    it('an item points at one run of its own house, of the kind it says', async () => {
      const s = await setup()
      const groceries = s.batch()
      const req = s.request()
      await s.putRun(groceries)
      await s.putRun(req)
      const milk = s.need('Milk', { run: { id: groceries.id, kind: 'batch' } })
      await s.putItem(milk)
      const leak = s.task('Leak', {
        run: { id: req.id, kind: 'request' },
        contactId: s.landlord.id,
      })
      await s.putItem(leak)
      expect(
        (await h.uow.run(s.me, (r) => r.items.onRun(groceries.id))).map((i) => i.title),
      ).toEqual(['Milk'])

      // The wrong kind, a run that doesn't exist, or a need on a request are all refused.
      await expect(
        s.putItem(s.need('Eggs', { run: { id: groceries.id, kind: 'visit' } })),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(
        s.putItem(s.need('Bread', { run: { id: h.ids.newId(), kind: 'batch' } })),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(
        s.putItem(s.need('Soap', { run: { id: req.id, kind: 'request' } })),
      ).rejects.toBeInstanceOf(ConstraintViolation)

      // Another house's run is off limits.
      const other = await setup()
      const theirs = other.batch()
      await other.putRun(theirs)
      await expect(
        s.putItem(s.need('Butter', { run: { id: theirs.id, kind: 'batch' } })),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })

    it('a task read back carries its run, so "handled by" stays with a request or visit (T51)', async () => {
      const s = await setup()
      const req = s.request()
      await s.putRun(req)
      const leak = s.task('Leak', {
        run: { id: req.id, kind: 'request' },
        contactId: s.landlord.id,
      })
      await s.putItem(leak)
      const edit = makeEditItem({ uow: h.uow, ids: h.ids, clock: fixedClock(T) })
      expect(await edit(s.me, { id: leak.id, patch: { contactId: null } })).toEqual({
        ok: false,
        error: 'on_a_run',
        detail: { runId: req.id },
      })
      expect(await h.uow.run(s.me, (r) => r.items.get(leak.id))).toEqual(leak)
    })

    it("members read and write their house's runs only, and start them in their own name", async () => {
      const s = await setup()
      const other = await setup()
      const theirs = other.batch()
      await other.putRun(theirs)
      expect(await s.getRun(theirs.id)).toBeUndefined()
      await expect(s.putRun({ ...s.batch(), houseId: other.house.id })).rejects.toBeInstanceOf(
        AccessDenied,
      )
      await expect(s.putRun(s.batch({ createdBy: s.admin }))).rejects.toBeInstanceOf(AccessDenied)
      // Anyone in the house can finish a run someone else started.
      const mine = s.batch()
      await s.putRun(mine)
      const finished: Batch = { ...mine, state: { open: false, finishedAt: LATER } }
      await h.uow.run(asMember(s.house.id, s.admin), (r) => r.runs.save(finished))
      expect(await s.getRun(mine.id)).toEqual(finished)
    })

    it("reads a run's story inside the transaction, including items moved into it", async () => {
      const s = await setup()
      const a = s.batch()
      const b = s.batch()
      await s.putRun(a)
      await s.putRun(b)
      const milk = s.need('Milk', { run: { id: b.id, kind: 'batch' } })
      await s.putItem(milk)
      const story = await h.uow.run(s.me, async (r) => {
        const actionId = h.ids.newId<'action'>()
        await r.events.record(
          s.house.id,
          [
            { kind: 'run.item_added', runId: a.id, itemId: milk.id, actionId, by: s.member },
            {
              kind: 'run.item_moved',
              runId: a.id,
              toRunId: b.id,
              itemId: milk.id,
              actionId,
              by: s.member,
            },
          ],
          T,
        )
        return [await r.events.forRun(s.house.id, a.id), await r.events.forRun(s.house.id, b.id)]
      })
      expect(story.map((rows) => rows.map((r) => r.kind))).toEqual([
        ['run.item_added', 'run.item_moved'],
        ['run.item_moved'],
      ])
    })

    it('a run keeps its kind', async () => {
      const s = await setup()
      const run = s.batch()
      await s.putRun(run)
      await expect(s.putRun({ ...s.visit(), id: run.id } as Run)).rejects.toBeInstanceOf(
        ConstraintViolation,
      )
    })
  })
