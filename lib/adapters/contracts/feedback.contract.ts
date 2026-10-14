// The feedback repository contract (T91): an active member adds feedback in their own name, for
// their own house, with a message that fits; nothing else is accepted. Members read none back, so
// the repo has no reads (the Postgres RLS test checks what's stored).

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, ConstraintViolation } from '../../app/ports'
import type { Feedback } from '../../domain/feedback'
import { instant } from '../../domain/time'
import { asMember, seedHouse, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 9, 14, 16, 0))

export const feedbackContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Feedback contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const feedback = (o: Partial<Feedback> = {}): Feedback => ({
        id: h.ids.newId(),
        houseId: seeded.house.id,
        userId: seeded.member,
        kind: 'idea',
        message: 'A dark mode for the calendar',
        appVersion: 'dev',
        userAgent: 'Mozilla/5.0 (iPhone)',
        createdAt: T,
        ...o,
      })
      return { ...seeded, feedback, me: asMember(seeded.house.id, seeded.member) }
    }

    it('a member adds their own, with or without a user agent', async () => {
      const s = await setup()
      const { userAgent: _ua, ...bare } = s.feedback({ kind: 'praise' })
      await expect(
        h.uow.run(s.me, async (r) => {
          await r.feedback.add(s.feedback({ kind: 'bug' }))
          await r.feedback.add(bare)
        }),
      ).resolves.toBeUndefined()
    })

    it('in your own name and house, with a message that fits', async () => {
      const s = await setup()
      const other = await setup()
      await expect(
        h.uow.run(s.me, (r) => r.feedback.add(s.feedback({ userId: s.admin }))),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(s.me, (r) => r.feedback.add(s.feedback({ houseId: other.house.id }))),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(s.me, (r) => r.feedback.add(s.feedback({ message: ' ' }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(
        h.uow.run(s.me, (r) => r.feedback.add(s.feedback({ message: 'x'.repeat(2001) }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })
  })
