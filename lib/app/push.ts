// Web Push use cases (ARCHITECTURE §7.4): a browser turning notifications on and off, and the job
// that drains the outbox (every 5 minutes, and right after a change that enqueued something).

import type { AppDeps } from './ports'
import { actorUser, type Actor, type HouseActor } from '../domain/actor'
import { asId, type HouseId, type UserId } from '../domain/ids'
import { DEFAULT_QUIET_HOURS, sendAfter } from '../domain/notifications'
import {
  afterAttempt,
  newSubscription,
  pushPayload,
  type BrowserSubscription,
  type PushOutcome,
} from '../domain/push'
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
 * Sends what's due in the outbox to each person's browsers. A browser the push service says is
 * gone is dropped; a message counts as delivered if any browser took it, and one that only met
 * passing failures is tried again later (T84).
 */
export const makeSendNotifications =
  ({ uow, clock, push }: Pick<AppDeps, 'uow' | 'clock' | 'push'>) =>
  () =>
    uow.run(ROOMIES, async (repos) => {
      const now = clock.now()
      const pending = await repos.notifications.pending(now, SEND_BATCH)
      let delivered = 0
      let retrying = 0
      let dropped = 0
      const houseTz = new Map<string, Promise<string | undefined>>()
      const quietFor = async (userId: UserId, houseId: HouseId) => {
        if (!houseTz.has(houseId))
          houseTz.set(
            houseId,
            repos.houses.get(houseId).then((h) => h?.settings.timezone),
          )
        const [p, houseZone] = await Promise.all([repos.profiles.get(userId), houseTz.get(houseId)])
        const tz = p?.timezone ?? houseZone
        return tz ? { tz, quiet: p?.quietHours ?? DEFAULT_QUIET_HOURS } : null
      }
      for (const m of pending) {
        const subs = await repos.pushSubscriptions.forUsers([m.userId])
        const outcomes: PushOutcome[] = []
        for (const sub of subs) {
          const outcome = await push.send(sub, pushPayload(m))
          outcomes.push(outcome)
          if (outcome.kind === 'sent') await repos.pushSubscriptions.markOk(sub.id, now)
          if (outcome.kind === 'gone') {
            await repos.pushSubscriptions.markGone(sub.id, now)
            dropped++
          }
        }
        const next = afterAttempt(outcomes, m.attempts, now)
        if (next.kind === 'retry') {
          retrying++
          // A retry waits out their quiet hours too, as the first try did (T84).
          const q = await quietFor(m.userId, m.houseId)
          const at = q ? sendAfter(next.at, q.tz, q.quiet) : next.at
          await repos.notifications.retryLater(m.id, at, m.attempts + 1, next.error)
        } else {
          if (!next.error) delivered++
          await repos.notifications.markSent(m.id, now, next.error)
        }
      }
      return ok({ messages: pending.length, delivered, retrying, droppedSubscriptions: dropped })
    })
