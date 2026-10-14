import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest, TEST_NOW } from '../compose'
import type { UserId } from '../domain/ids'
import { sampleHouse } from '../testing/sample-house'
import { makeSendFeedback } from './feedback'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  return { deps, s, as }
}

describe('sending feedback', () => {
  it('stores one row with the sender, house, version and user agent, and no activity', async () => {
    const { deps, s, as } = await setup()
    const activityBefore = deps.uow.state.activity.length
    const outboxBefore = deps.uow.state.outbox.length
    const r = await makeSendFeedback(deps)(
      as('Wren'),
      { kind: 'bug', message: ' The calendar is blank ' },
      { userAgent: 'Mozilla/5.0 (iPhone)' },
    )
    expect(r.ok).toBe(true)
    expect(deps.uow.state.feedback).toEqual([
      {
        id: r.ok && r.value.id,
        houseId: s.house.id,
        userId: s.people.Wren,
        kind: 'bug',
        message: 'The calendar is blank',
        appVersion: 'test',
        userAgent: 'Mozilla/5.0 (iPhone)',
        createdAt: TEST_NOW,
      },
    ])
    expect(deps.uow.state.activity).toHaveLength(activityBefore)
    expect(deps.uow.state.outbox).toHaveLength(outboxBefore)
  })

  it('an empty message stores nothing', async () => {
    const { deps, as } = await setup()
    const r = await makeSendFeedback(deps)(as('Sam'), { kind: 'idea', message: '   ' })
    expect(r).toEqual({ ok: false, error: 'empty' })
    expect(deps.uow.state.feedback).toEqual([])
  })

  it('not for a house you’ve left', async () => {
    const { deps, s } = await setup()
    const stranger = asMember(s.house.id, deps.ids.newId<'user'>() as UserId)
    await expect(
      makeSendFeedback(deps)(stranger, { kind: 'praise', message: 'Love it' }),
    ).rejects.toThrow(/feedback/)
  })
})
