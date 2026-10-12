import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { plusMs, MS_PER_HOUR, MS_PER_MINUTE } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeEditItem } from './items'
import {
  makeForgetPushSubscription,
  makeIsPushSubscriptionSaved,
  makeSavePushSubscription,
  makeSendNotifications,
} from './push'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const subscribe = (who: keyof typeof s.people, endpoint: string, auth = 'a') =>
    makeSavePushSubscription(deps)(as(who), {
      subscription: { endpoint, keys: { p256dh: 'p', auth } },
    })
  const assignTo = async (who: keyof typeof s.people) => {
    const r = await makeCreateItem(deps)(as('Kavya'), { category: 'task', title: 'Fix the latch' })
    if (!r.ok) throw new Error(r.error)
    await makeEditItem(deps)(as('Kavya'), { id: r.value.id, patch: { assignee: s.people[who] } })
    return r.value
  }
  const forget = (who: keyof typeof s.people, endpoint: string) =>
    makeForgetPushSubscription(deps)({ kind: 'user', userId: s.people[who] }, endpoint)
  const isSaved = (who: keyof typeof s.people, endpoint: string) =>
    makeIsPushSubscriptionSaved(deps)(as(who), endpoint)
  const later = (ms: number) => deps.clock.set(plusMs(deps.clock.now(), ms))
  return {
    deps,
    s,
    as,
    subscribe,
    forget,
    isSaved,
    later,
    assignTo,
    send: makeSendNotifications(deps),
  }
}

describe('sending notifications', () => {
  it("being assigned something pushes to each of that person's browsers", async () => {
    const t = await setup()
    await t.subscribe('Wren', 'https://push.example/wren-phone')
    await t.subscribe('Wren', 'https://push.example/wren-laptop')
    const latch = await t.assignTo('Wren')
    expect(await t.send()).toEqual({
      ok: true,
      value: { messages: 1, delivered: 1, retrying: 0, droppedSubscriptions: 0 },
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

describe('a shared phone (T84)', () => {
  const phone = 'https://push.example/shared-phone'

  it("signing out stops that browser getting your pushes; the next person's go to it", async () => {
    const t = await setup()
    await t.subscribe('Wren', phone)
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: true })
    expect(await t.forget('Wren', phone)).toEqual({ ok: true, value: true })
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: false })

    expect(await t.subscribe('Sam', phone)).toEqual({ ok: true, value: true })
    await t.assignTo('Wren')
    await t.assignTo('Sam')
    await t.send()
    expect(
      t.deps.push.sent.map((x) => [x.endpoint, (x.payload as { title: string }).title]),
    ).toEqual([[phone, 'For you: Fix the latch']])
    // Wren's went nowhere (that phone isn't hers any more); Sam's reached it.
    const [toWren, toSam] = t.deps.uow.state.outbox.slice(-2)
    expect(toWren).toMatchObject({ userId: t.s.people.Wren, error: 'no_subscription' })
    expect(toSam).toMatchObject({ userId: t.s.people.Sam })
    expect(toSam?.error).toBeUndefined()
  })

  it('turning notifications on moves the browser to you, even if nobody signed out', async () => {
    const t = await setup()
    await t.subscribe('Wren', phone)
    expect(await t.subscribe('Sam', phone)).toEqual({ ok: true, value: true })
    expect(t.deps.uow.state.pushSubs.size).toBe(1)
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: false })
    expect(await t.isSaved('Sam', phone)).toEqual({ ok: true, value: true })
  })

  it("knowing someone's endpoint isn't enough to take their browser", async () => {
    const t = await setup()
    await t.subscribe('Wren', phone)
    expect(await t.subscribe('Sam', phone, 'guessed')).toEqual({ ok: false, error: 'not_found' })
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: true })
    // Once Wren signed out on it, it's free for whoever turns it on next.
    await t.forget('Wren', phone)
    expect(await t.subscribe('Sam', phone, 'fresh')).toEqual({ ok: true, value: true })
    expect(await t.isSaved('Sam', phone)).toEqual({ ok: true, value: true })
  })

  it('signing out again leaves the first sign-out time', async () => {
    const t = await setup()
    await t.subscribe('Wren', phone)
    await t.forget('Wren', phone)
    const first = [...t.deps.uow.state.pushSubs.values()][0]?.goneAt
    t.later(MS_PER_HOUR)
    await t.forget('Wren', phone)
    expect([...t.deps.uow.state.pushSubs.values()][0]?.goneAt).toEqual(first)
  })

  it("forgetting touches only your own browsers, and only a house's members save one", async () => {
    const t = await setup()
    await t.subscribe('Wren', phone)
    await t.forget('Sam', phone)
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: true })

    const stranger = t.deps.ids.newId<'user'>() as UserId
    expect(
      await makeSavePushSubscription(t.deps)(
        { kind: 'member', userId: stranger, houseId: t.s.house.id },
        { subscription: { endpoint: phone, keys: { p256dh: 'p', auth: 'a' } } },
      ),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await t.isSaved('Wren', phone)).toEqual({ ok: true, value: true })
  })
})

describe('passing push failures (T84)', () => {
  it('a 5xx is tried again after 5 minutes and delivered then', async () => {
    const t = await setup()
    await t.subscribe('Sam', 'https://push.example/sam')
    t.deps.push.failing.add('https://push.example/sam')
    await t.assignTo('Sam')
    expect(await t.send()).toMatchObject({ value: { messages: 1, delivered: 0, retrying: 1 } })
    expect(t.deps.uow.state.outbox.at(-1)).toMatchObject({ attempts: 1, error: 'push_failed' })
    expect(t.deps.uow.state.outbox.at(-1)?.sentAt).toBeUndefined()

    // Not before its time; then the push service is back.
    t.later(4 * MS_PER_MINUTE)
    expect(await t.send()).toMatchObject({ value: { messages: 0 } })
    t.deps.push.failing.clear()
    t.later(MS_PER_MINUTE)
    expect(await t.send()).toMatchObject({ value: { messages: 1, delivered: 1, retrying: 0 } })
    expect(t.deps.push.sent.map((x) => x.endpoint)).toEqual(['https://push.example/sam'])
    expect(t.deps.uow.state.outbox.at(-1)?.sentAt).toBeDefined()
  })

  it('a retry that would land in quiet hours waits for them to end', async () => {
    const t = await setup()
    await t.subscribe('Sam', 'https://push.example/sam')
    t.deps.push.failing.add('https://push.example/sam')
    // 9:58pm: the 5-minute retry would be 10:03pm, so it waits for 8am.
    t.later(9 * MS_PER_HOUR + 58 * MS_PER_MINUTE)
    await t.assignTo('Sam')
    expect(await t.send()).toMatchObject({ value: { retrying: 1 } })
    const retry = t.deps.uow.state.outbox.at(-1)?.sendAfter
    expect(retry?.epochMs).toBe(
      plusMs(t.deps.clock.now(), 10 * MS_PER_HOUR + 2 * MS_PER_MINUTE).epochMs,
    )
  })

  it("a refusal that won't pass isn't tried again, and the browser is kept", async () => {
    const t = await setup()
    await t.subscribe('Sam', 'https://push.example/sam')
    t.deps.push.rejecting.add('https://push.example/sam')
    await t.assignTo('Sam')
    expect(await t.send()).toMatchObject({ value: { delivered: 0, retrying: 0 } })
    expect(t.deps.uow.state.outbox.at(-1)).toMatchObject({ error: 'push_rejected' })
    expect(t.deps.uow.state.outbox.at(-1)?.sentAt).toBeDefined()
    expect(await t.isSaved('Sam', 'https://push.example/sam')).toEqual({ ok: true, value: true })
  })

  it('gives up after 5 minutes, 30 minutes and 2 hours, keeping why', async () => {
    const t = await setup()
    await t.subscribe('Sam', 'https://push.example/sam')
    t.deps.push.failing.add('https://push.example/sam')
    await t.assignTo('Sam')
    for (const wait of [0, 5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE, 2 * MS_PER_HOUR]) {
      t.later(wait)
      expect(await t.send()).toMatchObject({ value: { messages: 1, delivered: 0 } })
    }
    expect(t.deps.uow.state.outbox.at(-1)).toMatchObject({ attempts: 3, error: 'push_failed' })
    expect(t.deps.uow.state.outbox.at(-1)?.sentAt).toBeDefined()
    t.later(6 * MS_PER_HOUR)
    expect(await t.send()).toMatchObject({ value: { messages: 0 } })
  })
})
