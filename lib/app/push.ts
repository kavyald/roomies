// Web Push use cases (ARCHITECTURE §7.1): a browser turning notifications on, and the job that
// drains the outbox (every 5 minutes, and right after a change that enqueued something).

import type { AppDeps } from './ports'
import { actorUser, type Actor, type HouseActor } from '../domain/actor'
import { asId, type HouseId } from '../domain/ids'
import {
  deliveryResult,
  newSubscription,
  pushPayload,
  type BrowserSubscription,
  type PushOutcome,
} from '../domain/push'
import { err, ok } from '../domain/result'

/** Roomies itself, outside any one house (the sender works across the outbox). */
const ROOMIES: Actor = {
  kind: 'system',
  houseId: asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId,
}

/** "Turn on notifications": remember this browser for me. */
export const makeSavePushSubscription =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: HouseActor, input: { subscription: BrowserSubscription; userAgent?: string }) =>
    uow.run(actor, async (repos) => {
      const userId = actorUser(actor)
      if (!userId) return err('not_found')
      const r = newSubscription(input.subscription, {
        id: ids.newId(),
        userId,
        now: clock.now(),
        userAgent: input.userAgent,
      })
      if (!r.ok) return r
      await repos.pushSubscriptions.save(r.value)
      return ok(true as const)
    })

export const SEND_BATCH = 100

/**
 * Sends what's due in the outbox to each person's browsers. A browser the push service says is
 * gone is dropped; a message counts as delivered if any browser took it.
 */
export const makeSendNotifications =
  ({ uow, clock, push }: Pick<AppDeps, 'uow' | 'clock' | 'push'>) =>
  () =>
    uow.run(ROOMIES, async (repos) => {
      const now = clock.now()
      const pending = await repos.notifications.pending(now, SEND_BATCH)
      let delivered = 0
      let dropped = 0
      for (const m of pending) {
        const subs = await repos.pushSubscriptions.forUsers([m.userId])
        const outcomes: PushOutcome[] = []
        for (const sub of subs) {
          const outcome = await push.send(sub, pushPayload(m))
          outcomes.push(outcome)
          if (outcome === 'sent') await repos.pushSubscriptions.markOk(sub.id, now)
          if (outcome === 'gone') {
            await repos.pushSubscriptions.markGone(sub.id, now)
            dropped++
          }
        }
        const error = deliveryResult(outcomes)
        if (!error) delivered++
        await repos.notifications.markSent(m.id, now, error)
      }
      return ok({ messages: pending.length, delivered, droppedSubscriptions: dropped })
    })
