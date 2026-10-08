// The polls repository contract (T27): a poll with its options and votes round-trips; anyone adds
// options and votes in their own name while it's open; labels are unique; closing locks it.

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, ConstraintViolation } from '../../app/ports'
import type { OptionId } from '../../domain/ids'
import type { Poll, PollOption } from '../../domain/polls'
import { instant } from '../../domain/time'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))
const LATER = instant(Date.UTC(2026, 9, 2, 16, 0))

export const pollsContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Polls contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const { house, member } = seeded
      const option = (label: string, by = member): PollOption => ({
        id: h.ids.newId<'option'>() as OptionId,
        label,
        addedBy: by,
        addedAt: T,
      })
      const poll = (o: Partial<Poll> = {}): Poll => ({
        id: h.ids.newId(),
        houseId: house.id,
        question: 'House name?',
        options: [option('The Nest'), { ...option('Burrow'), note: 'cozy' }],
        votes: [],
        createdBy: member,
        createdAt: T,
        state: { open: true },
        ...o,
      })
      const as = (who: typeof member) => asMember(house.id, who)
      const get = (id: Poll['id']) => h.uow.run(as(member), (r) => r.polls.get(id))
      return { ...seeded, option, poll, as, get }
    }

    it('round-trips a poll with its options, votes, deadline, and closing', async () => {
      const s = await setup()
      const p = s.poll({ closesAt: LATER })
      await h.uow.run(s.as(s.member), (r) => r.polls.create(p))
      expect(await s.get(p.id)).toEqual(p)

      const extra = s.option('Casa', s.admin)
      await h.uow.run(s.as(s.admin), async (r) => {
        await r.polls.addOption(p, extra)
        await r.polls.setVote(p, { user: s.admin, option: extra.id, at: T })
      })
      // Changing a vote replaces it.
      await h.uow.run(s.as(s.member), async (r) => {
        await r.polls.setVote(p, { user: s.member, option: p.options[0]!.id, at: T })
        await r.polls.setVote(p, { user: s.member, option: p.options[1]!.id, at: LATER })
      })
      const withVotes = await s.get(p.id)
      expect(withVotes?.options.map((o) => o.label)).toEqual(['The Nest', 'Burrow', 'Casa'])
      expect(withVotes?.votes).toHaveLength(2)
      expect(withVotes?.votes).toContainEqual({
        user: s.member,
        option: p.options[1]!.id,
        at: LATER,
      })

      const closed: Poll = { ...withVotes!, state: { open: false, closedAt: LATER } }
      await h.uow.run(s.as(s.admin), (r) => r.polls.saveState(closed))
      expect((await s.get(p.id))?.state).toEqual({ open: false, closedAt: LATER })
      expect(
        (await h.uow.run(s.as(s.member), (r) => r.polls.listByHouse(s.house.id))).map((x) => x.id),
      ).toEqual([p.id])
    })

    it('votes and options are in your own name, and a closed poll takes neither', async () => {
      const s = await setup()
      const p = s.poll()
      await h.uow.run(s.as(s.member), (r) => r.polls.create(p))
      await expect(
        h.uow.run(s.as(s.member), (r) =>
          r.polls.setVote(p, { user: s.admin, option: p.options[0]!.id, at: T }),
        ),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.addOption(p, s.option('Casa', s.admin))),
      ).rejects.toBeInstanceOf(AccessDenied)

      await h.uow.run(s.as(s.member), (r) =>
        r.polls.saveState({ ...p, state: { open: false, closedAt: T } }),
      )
      await expect(
        h.uow.run(s.as(s.member), (r) =>
          r.polls.setVote(p, { user: s.member, option: p.options[0]!.id, at: T }),
        ),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.addOption(p, s.option('Casa'))),
      ).rejects.toBeInstanceOf(AccessDenied)
    })

    it('you take back only your own vote, only while it is open (T55)', async () => {
      const s = await setup()
      const p = s.poll()
      await h.uow.run(s.as(s.member), (r) => r.polls.create(p))
      const nest = p.options[0]!.id
      await h.uow.run(s.as(s.member), (r) =>
        r.polls.setVote(p, { user: s.member, option: nest, at: T }),
      )
      await h.uow.run(s.as(s.admin), (r) =>
        r.polls.setVote(p, { user: s.admin, option: nest, at: T }),
      )
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.removeVote(p, s.admin)),
      ).rejects.toBeInstanceOf(AccessDenied)
      await h.uow.run(s.as(s.member), (r) => r.polls.removeVote(p, s.member))
      expect((await s.get(p.id))?.votes.map((v) => v.user)).toEqual([s.admin])
      // Nothing left to take back.
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.removeVote(p, s.member)),
      ).rejects.toBeInstanceOf(AccessDenied)

      await h.uow.run(s.as(s.member), (r) =>
        r.polls.saveState({ ...p, state: { open: false, closedAt: T } }),
      )
      await expect(
        h.uow.run(s.as(s.admin), (r) => r.polls.removeVote(p, s.admin)),
      ).rejects.toBeInstanceOf(AccessDenied)
      expect((await s.get(p.id))?.votes).toHaveLength(1)
    })

    it('any member reopens a closed poll and changes or clears its deadline (T55)', async () => {
      const s = await setup()
      const p = s.poll({ closesAt: T })
      await h.uow.run(s.as(s.member), (r) => r.polls.create(p))
      await h.uow.run(s.as(s.member), (r) =>
        r.polls.saveState({ ...p, state: { open: false, closedAt: T } }),
      )
      // Reopened by someone else, with the deadline taken off: closed_at and closes_at clear.
      const { closesAt: _gone, ...noDeadline } = p
      await h.uow.run(s.as(s.admin), (r) => r.polls.saveState(noDeadline))
      const reopened = await s.get(p.id)
      expect(reopened?.state).toEqual({ open: true })
      expect(reopened?.closesAt).toBeUndefined()
      // Options and votes unlock again.
      await h.uow.run(s.as(s.admin), (r) =>
        r.polls.setVote(p, { user: s.admin, option: p.options[0]!.id, at: LATER }),
      )
      await h.uow.run(s.as(s.member), (r) => r.polls.saveState({ ...p, closesAt: LATER }))
      expect((await s.get(p.id))?.closesAt).toEqual(LATER)
      expect((await s.get(p.id))?.votes).toHaveLength(1)
    })

    it('labels are unique in a poll (any case), and a vote must be for one of its options', async () => {
      const s = await setup()
      const p = s.poll()
      await h.uow.run(s.as(s.member), (r) => r.polls.create(p))
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.addOption(p, s.option(' the nest'))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      const other = s.poll()
      await h.uow.run(s.as(s.member), (r) => r.polls.create(other))
      await expect(
        h.uow.run(s.as(s.member), (r) =>
          r.polls.setVote(p, { user: s.member, option: other.options[0]!.id, at: T }),
        ),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })

    it("another house's polls are invisible, and you can't create one there", async () => {
      const s = await setup()
      const other = await setup()
      const theirs = other.poll()
      await h.uow.run(other.as(other.member), (r) => r.polls.create(theirs))
      expect(await s.get(theirs.id)).toBeUndefined()
      await expect(
        h.uow.run(s.as(s.member), (r) => r.polls.create({ ...s.poll(), houseId: other.house.id })),
      ).rejects.toBeInstanceOf(AccessDenied)
      expect(await h.uow.run(system(other.house.id), (r) => r.polls.get(theirs.id))).toMatchObject({
        id: theirs.id,
      })
    })
  })
