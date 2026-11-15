// Web Push use cases (ARCHITECTURE §7.4): a browser turning notifications on and off, and the job
// that drains the outbox (every 5 minutes, and right after a change that enqueued something).

import type { AppDeps, Repos } from './ports'
import { actorUser, type Actor, type HouseActor } from '../domain/actor'
import { asId, type HouseId, type UserId } from '../domain/ids'
import { DEFAULT_QUIET_HOURS, sendAfter } from '../domain/notifications'
import {
  afterAttempt,
  CLAIM_LEASE_MS,
  newSubscription,
  pushPayload,
  whyNotSend,
  type BrowserSubscription,
  type PendingMessage,
  type PushOutcome,
} from '../domain/push'
import { plusMs } from '../domain/time'
import { err, ok, type Result } from '../domain/result'

/** Roomies itself, outside any one house (the sender works across the outbox). */
const ROOMIES: Actor = {
  kind: 'system',
  houseId: asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId,
}

/**
 * "Turn on notifications": remember this browser for me. If it's saved under someone else (they
 * didn't sign out on it), it moves to me only when the keys match, since the same browser hands back
 * the same subscription (T84); knowing the endpoint alone isn't enough. Moving it is a system write,
 * so the membership check runs in the same transaction.
 */
export const makeSavePushSubscription =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  async (actor: HouseActor, input: { subscription: BrowserSubscription; userAgent?: string }) => {
    const userId = actorUser(actor)
    if (!userId) return err('not_found')
    const r = newSubscription(input.subscription, {
      id: ids.newId(),
      userId,
      now: clock.now(),
      userAgent: input.userAgent,
    })
    if (!r.ok) return r
    const sub = r.value
    return uow.run({ kind: 'system', houseId: actor.houseId }, async (repos) => {
      const member = await repos.members.get(actor.houseId, userId)
      if (!member?.status.active) return err('not_found')
      const saved = await repos.pushSubscriptions.byEndpoint(sub.endpoint)
      const someoneElses = saved && saved.userId !== userId && !saved.goneAt
      if (
        someoneElses &&
        (saved.keys.p256dh !== sub.keys.p256dh || saved.keys.auth !== sub.keys.auth)
      )
        return err('not_found')
      await repos.pushSubscriptions.save(sub)
      return ok(true as const)
    })
  }

/** Signing out: stop sending to this browser (T84). Only your own browsers are touched. */
export const makeForgetPushSubscription =
  ({ uow, clock }: Pick<AppDeps, 'uow' | 'clock'>) =>
  (actor: Actor, endpoint: string) =>
    uow.run(actor, async (repos) => {
      await repos.pushSubscriptions.forget(endpoint, clock.now())
      return ok(true as const)
    })

/** Whether this browser is on for me as far as the server knows (it shows "on" only then). */
export const makeIsPushSubscriptionSaved =
  ({ uow }: Pick<AppDeps, 'uow'>) =>
  (actor: HouseActor, endpoint: string) =>
    uow.run(actor, async (repos): Promise<Result<boolean, never>> => {
      const userId = actorUser(actor)
      if (!userId) return ok(false)
      const saved = await repos.pushSubscriptions.byEndpoint(endpoint)
      return ok(saved?.userId === userId && !saved.goneAt)
    })

export const SEND_BATCH = 100

/**
 * Sends what's due in the outbox to each person's browsers (T83: once each, and only while still
 * true). It claims a batch in one short transaction, which also drops messages that stopped being
 * true while they waited (moved out, category off, a reminder whose day is over: `whyNotSend`).
 * Then each message is pushed and marked in its own transaction, so a crash re-sends at most the one
 * in flight; the claim runs out after `CLAIM_LEASE_MS` and frees whatever wasn't reached. A browser
 * the push service says is gone is dropped; a message counts as delivered if any browser took it,
 * and one that only met passing failures is tried again later (T84).
 */
export const makeSendNotifications =
  ({ uow, clock, push }: Pick<AppDeps, 'uow' | 'clock' | 'push'>) =>
  async () => {
    const now = clock.now()
    const { due, skipped } = await uow.run(ROOMIES, async (repos) => {
      const claimed = await repos.notifications.claim(now, SEND_BATCH, plusMs(now, CLAIM_LEASE_MS))
      const off = await repos.notifications.offFor([...new Set(claimed.map((m) => m.userId))])
      const active = new Map<string, boolean>()
      const due: PendingMessage[] = []
      let skipped = 0
      for (const m of claimed) {
        const key = `${m.houseId}|${m.userId}`
        if (!active.has(key))
          active.set(key, !!(await repos.members.get(m.houseId, m.userId))?.status.active)
        const why = whyNotSend(m, now, {
          active: active.get(key)!,
          off: off.get(m.userId) ?? new Set(),
        })
        if (why) {
          await repos.notifications.markSent(m.id, now, why)
          skipped++
        } else due.push(m)
      }
      return { due, skipped }
    })
    let delivered = 0
    let retrying = 0
    let dropped = 0
    for (const m of due) {
      const subs = await uow.run(ROOMIES, (r) => r.pushSubscriptions.forUsers([m.userId]))
      const outcomes: { id: string; outcome: PushOutcome }[] = []
      for (const sub of subs)
        outcomes.push({ id: sub.id, outcome: await push.send(sub, pushPayload(m)) })
      const next = afterAttempt(
        outcomes.map((o) => o.outcome),
        m.attempts,
        now,
      )
      await uow.run(ROOMIES, async (repos) => {
        for (const { id, outcome } of outcomes) {
          if (outcome.kind === 'sent') await repos.pushSubscriptions.markOk(id, now)
          if (outcome.kind === 'gone') await repos.pushSubscriptions.markGone(id, now)
        }
        if (next.kind === 'retry') {
          // A retry waits out their quiet hours too, as the first try did (T84).
          const q = await quietFor(repos, m.userId, m.houseId)
          const at = q ? sendAfter(next.at, q.tz, q.quiet) : next.at
          await repos.notifications.retryLater(m.id, at, m.attempts + 1, next.error)
        } else await repos.notifications.markSent(m.id, now, next.error)
      })
      dropped += outcomes.filter((o) => o.outcome.kind === 'gone').length
      if (next.kind === 'retry') retrying++
      else if (!next.error) delivered++
    }
    return ok({
      messages: due.length + skipped,
      delivered,
      retrying,
      skipped,
      droppedSubscriptions: dropped,
    })
  }

/** Their time zone (theirs, else the house's) and quiet hours. */
const quietFor = async (repos: Repos, userId: UserId, houseId: HouseId) => {
  const [p, house] = await Promise.all([repos.profiles.get(userId), repos.houses.get(houseId)])
  const tz = p?.timezone ?? house?.settings.timezone
  return tz ? { tz, quiet: p?.quietHours ?? DEFAULT_QUIET_HOURS } : null
}
