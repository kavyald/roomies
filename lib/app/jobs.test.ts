import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest, TEST_NOW } from '../compose'
import type { UserId } from '../domain/ids'
import {
  addDays,
  instantAt,
  localDateOf,
  MS_PER_DAY,
  MS_PER_HOUR,
  plusMs,
  type LocalTime,
} from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem } from './items'
import { makeCloseDuePolls, makeRunReminders } from './jobs'
import { makeCreatePoll, makeVote } from './polls'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const tz = s.house.settings.timezone
  const today = localDateOf(TEST_NOW, tz) // Tue, noon in New York
  const outbox = () => deps.uow.state.outbox
  return { deps, s, as, tz, today, outbox }
}

describe('runReminders (fixed clock)', () => {
  it('reminds the assignee the day before and the day of, and is idempotent', async () => {
    const t = await setup()
    const create = makeCreateItem(t.deps)
    await create(t.as('Kavya'), {
      category: 'task',
      title: 'Call the plumber',
      assignee: t.s.people.Wren,
      when: { date: addDays(t.today, 1) },
    })
    t.outbox().length = 0 // just the reminders
    const run = makeRunReminders(t.deps)
    expect(await run()).toEqual({ ok: true, value: { houses: 1, enqueued: 1 } })
    expect(t.outbox()).toEqual([
      expect.objectContaining({
        userId: t.s.people.Wren,
        category: 'due',
        title: 'Tomorrow: Call the plumber',
      }),
    ])
    // Run twice, the same day: nothing new.
    expect(await run()).toMatchObject({ value: { enqueued: 0 } })
    t.deps.clock.set(plusMs(TEST_NOW, 3 * MS_PER_HOUR))
    expect(await run()).toMatchObject({ value: { enqueued: 0 } })
    // The next day it's "Today" (a new reminder), once.
    t.deps.clock.set(plusMs(TEST_NOW, MS_PER_DAY))
    expect(await run()).toMatchObject({ value: { enqueued: 1 } })
    expect(await run()).toMatchObject({ value: { enqueued: 0 } })
    expect(t.outbox().map((m) => m.title)).toEqual([
      'Tomorrow: Call the plumber',
      'Today: Call the plumber',
    ])
  })

  it('reminders wait out quiet hours, and respect turned-off categories', async () => {
    const t = await setup()
    await makeCreateItem(t.deps)(t.as('Kavya'), {
      category: 'task',
      title: 'Pay the internet',
      assignee: t.s.people.Sam,
      when: { date: t.today },
    })
    await makeCreateItem(t.deps)(t.as('Kavya'), {
      category: 'task',
      title: 'Water the plants',
      assignee: t.s.people.Jo,
      when: { date: t.today },
    })
    await t.deps.uow.run(t.as('Jo'), (r) => r.notifications.setEnabled(t.s.people.Jo, 'due', false))
    t.outbox().length = 0
    // Just after midnight: the day-of reminder is held until 8am.
    t.deps.clock.set(instantAt(t.today, '00:15' as LocalTime, t.tz))
    await makeRunReminders(t.deps)()
    expect(t.outbox().map((m) => [m.title, m.sendAfter])).toEqual([
      ['Today: Pay the internet', instantAt(t.today, '08:00' as LocalTime, t.tz)],
    ])
  })
})

describe('closeDuePolls (fixed clock)', () => {
  it('closes polls past their deadline, records the result, and is idempotent', async () => {
    const t = await setup()
    const poll = await makeCreatePoll(t.deps)(t.as('Kavya'), {
      question: 'House name?',
      options: [{ label: 'The Nest' }, { label: 'Burrow' }],
      closesAt: plusMs(TEST_NOW, 2 * MS_PER_HOUR),
    })
    if (!poll.ok) throw new Error(poll.error)
    await makeVote(t.deps)(t.as('Wren'), {
      pollId: poll.value.id,
      optionId: poll.value.options[1]!.id,
    })
    const close = makeCloseDuePolls(t.deps)
    expect(await close()).toEqual({ ok: true, value: { closed: 0 } }) // not due yet
    t.deps.clock.set(plusMs(TEST_NOW, 3 * MS_PER_HOUR))
    t.outbox().length = 0
    expect(await close()).toEqual({ ok: true, value: { closed: 1 } })
    expect(t.deps.uow.state.polls.get(poll.value.id)?.state).toMatchObject({ open: false })
    expect(t.deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'poll.closed',
      actorId: null,
      payload: { v: 1, result: 'winner' },
    })
    // Everyone hears how it came out.
    expect(new Set(t.outbox().map((m) => m.body))).toEqual(new Set(['Burrow wins (1–0)']))
    expect(t.outbox()).toHaveLength(4)
    expect(await close()).toEqual({ ok: true, value: { closed: 0 } })
  })
})
