import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { plusMs, MS_PER_HOUR } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeEditItem } from './items'
import { makeSavePushSubscription, makeSendNotifications } from './push'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const subscribe = (who: keyof typeof s.people, endpoint: string) =>
    makeSavePushSubscription(deps)(as(who), {
      subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
    })
  const assignTo = async (who: keyof typeof s.people) => {
    const r = await makeCreateItem(deps)(as('Kavya'), { category: 'task', title: 'Fix the latch' })
    if (!r.ok) throw new Error(r.error)
    await makeEditItem(deps)(as('Kavya'), { id: r.value.id, patch: { assignee: s.people[who] } })
    return r.value
  }
  return { deps, s, as, subscribe, assignTo, send: makeSendNotifications(deps) }
}

describe('sending notifications', () => {
  it("being assigned something pushes to each of that person's browsers", async () => {
    const t = await setup()
    await t.subscribe('Wren', 'https://push.example/wren-phone')
    await t.subscribe('Wren', 'https://push.example/wren-laptop')
    const latch = await t.assignTo('Wren')
    expect(await t.send()).toEqual({
      ok: true,
      value: { messages: 1, delivered: 1, droppedSubscriptions: 0 },
    })
    expect(t.deps.push.sent).toEqual(
      ['https://push.example/wren-phone', 'https://push.example/wren-laptop'].map((endpoint) => ({
        endpoint,
        payload: {
          title: 'For you: Fix the latch',
          body: 'Kavya asked you to take this on.',
          url: `/h/${t.s.house.id}/i/${latch.id}`,
          tag: `assigned:/h/${t.s.house.id}/i/${latch.id}`,
        },
      })),
    )
    // Sent once: a second run has nothing to do.
    expect(await t.send()).toMatchObject({ value: { messages: 0 } })
  })

  it('drops a browser the push service says is gone (410), and keeps the others', async () => {
    const t = await setup()
    await t.subscribe('Wren', 'https://push.example/old')
    await t.subscribe('Wren', 'https://push.example/new')
    t.deps.push.gone.add('https://push.example/old')
    await t.assignTo('Wren')
    expect(await t.send()).toMatchObject({ value: { delivered: 1, droppedSubscriptions: 1 } })
    const subs = [...t.deps.uow.state.pushSubs.values()]
    expect(subs.find((x) => x.endpoint.endsWith('/old'))?.goneAt).toBeDefined()
    expect(subs.find((x) => x.endpoint.endsWith('/new'))?.lastOkAt).toBeDefined()
    // Next time only the working browser is tried.
    t.deps.push.sent.length = 0
    await t.assignTo('Wren')
    await t.send()
    expect(t.deps.push.sent.map((x) => x.endpoint)).toEqual(['https://push.example/new'])
  })

  it("records why a message didn't go, and waits out quiet hours", async () => {
    const t = await setup()
    await t.assignTo('Jo') // Jo never turned notifications on
    await t.send()
    expect(t.deps.uow.state.outbox.at(-1)).toMatchObject({ error: 'no_subscription' })

    await t.subscribe('Sam', 'https://push.example/sam')
    t.deps.push.failing.add('https://push.example/sam')
    await t.assignTo('Sam')
    await t.send()
    expect(t.deps.uow.state.outbox.at(-1)).toMatchObject({ error: 'push_failed' })

    // At 11pm the message waits for 8am.
    t.deps.clock.set(plusMs(t.deps.clock.now(), 11 * MS_PER_HOUR))
    await t.subscribe('Wren', 'https://push.example/wren')
    await t.assignTo('Wren')
    expect(await t.send()).toMatchObject({ value: { messages: 0 } })
    t.deps.clock.set(plusMs(t.deps.clock.now(), 9 * MS_PER_HOUR))
    expect(await t.send()).toMatchObject({ value: { messages: 1, delivered: 1 } })
  })

  it('stores only real subscriptions, in your own name', async () => {
    const t = await setup()
    expect(await t.subscribe('Wren', 'http://not-secure.example')).toEqual({
      ok: false,
      error: 'invalid_subscription',
    })
    expect((await t.subscribe('Wren', 'https://push.example/a')).ok).toBe(true)
    // The same browser again refreshes it rather than adding a second.
    expect((await t.subscribe('Wren', 'https://push.example/a')).ok).toBe(true)
    expect(t.deps.uow.state.pushSubs.size).toBe(1)
  })
})
