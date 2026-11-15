import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { MS_PER_HOUR, plusMs, type LocalTime } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeSetFeeling } from './items'
import { makeSetNotificationEnabled, makeUpdateMySettings } from './me'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  return { deps, s, as }
}

describe('personal settings', () => {
  it('turning off a category stops those messages from being enqueued', async () => {
    const { deps, s, as } = await setup()
    const leak = await makeCreateItem(deps)(as('Kavya'), {
      category: 'task',
      title: 'Leak',
      assignee: s.people.Wren,
    })
    if (!leak.ok) throw new Error(leak.error)
    const feel = (kind: 'anxious' | 'frustrated') =>
      makeSetFeeling(deps)(as('Sam'), { itemId: leak.value.id, kind })
    const toWren = () =>
      deps.uow.state.outbox.filter((m) => m.userId === s.people.Wren && m.category === 'feelings')

    await feel('anxious')
    expect(toWren()).toHaveLength(1)
    expect(
      await makeSetNotificationEnabled(deps)(as('Wren'), { category: 'feelings', enabled: false }),
    ).toMatchObject({ ok: true })
    await feel('frustrated')
    expect(toWren()).toHaveLength(1) // nothing new
    await makeSetNotificationEnabled(deps)(as('Wren'), { category: 'feelings', enabled: true })
    await feel('anxious')
    expect(toWren()).toHaveLength(2)
  })

  it('saves my theme and quiet hours, and only mine', async () => {
    const { deps, s, as } = await setup()
    const update = makeUpdateMySettings(deps)
    const r = await update(as('Jo'), {
      theme: 'dark',
      quietHours: { start: '23:00' as LocalTime, end: '07:00' as LocalTime },
    })
    expect(r.ok && r.value).toMatchObject({ theme: 'dark', quietHours: { start: '23:00' } })
    expect(deps.uow.state.profiles.get(s.people.Jo)).toMatchObject({ theme: 'dark' })
    expect(deps.uow.state.profiles.get(s.people.Kavya)?.theme).toBe('auto')
    expect(await update(as('Jo'), { theme: 'dark' })).toEqual({ ok: false, error: 'no_change' })
  })
})

describe('quiet hours changed after messages were held (T83)', () => {
  it('held messages follow the new quiet hours', async () => {
    const { deps, s, as } = await setup()
    deps.clock.set(plusMs(deps.clock.now(), 11 * MS_PER_HOUR)) // 11pm: held until 8am
    await makeCreateItem(deps)(as('Kavya'), {
      category: 'task',
      title: 'Leak',
      assignee: s.people.Wren,
    })
    const held = () => deps.uow.state.outbox.find((m) => m.userId === s.people.Wren)!
    const eight = held().sendAfter
    expect(eight.epochMs).toBeGreaterThan(deps.clock.now().epochMs)
    const update = makeUpdateMySettings(deps)
    const quiet = (start: string, end: string) =>
      update(as('Wren'), { quietHours: { start: start as LocalTime, end: end as LocalTime } })
    // Quiet until 9 instead: an hour later.
    await quiet('22:00', '09:00')
    expect(held().sendAfter).toEqual(plusMs(eight, MS_PER_HOUR))
    // No quiet hours at all: it goes now.
    await quiet('00:00', '00:00')
    expect(held().sendAfter).toEqual(deps.clock.now())
  })
})
