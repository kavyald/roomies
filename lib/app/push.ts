// Web Push use cases (ARCHITECTURE §7.4): a browser turning notifications on and off, and the job
// that drains the outbox (every 5 minutes, and right after a change that enqueued something).

import type { AppDeps } from './ports'
import { actorUser, type Actor, type HouseActor } from '../domain/actor'
import { asId, type HouseId } from '../domain/ids'
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
 * "Turn on notifications": remember this browser for me. If it was saved under someone else (they
 * signed out without it being forgotten), it moves to me, so it's saved as the system (T84):
 * holding the endpoint and its keys is the proof it's this device.
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
    // The system write skips RLS, so membership is checked first, as the member.
    const member = await uow.run(actor, (repos) => repos.members.get(actor.houseId, userId))
    if (!member?.status.active) return err('not_found')
    await uow.run({ kind: 'system', houseId: actor.houseId }, (repos) =>
      repos.pushSubscriptions.save(r.value),
    )
    return ok(true as const)
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
      const mine = await repos.pushSubscriptions.forUsers([userId])
      return ok(mine.some((s) => s.endpoint === endpoint))
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
          await repos.notifications.retryLater(m.id, next.at, m.attempts + 1, next.error)
        } else {
          if (!next.error) delivered++
          await repos.notifications.markSent(m.id, now, next.error)
        }
      }
      return ok({ messages: pending.length, delivered, retrying, droppedSubscriptions: dropped })
    })
