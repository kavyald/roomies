// Feedback (T91, PRD §6.8): a member sends the owner a bug, an idea or praise. No event and no
// notifications: it's for the owner, read in the Supabase dashboard, not house history (A34).

import type { AppDeps } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import { makeFeedback, type NewFeedback } from '../domain/feedback'
import { err, ok } from '../domain/result'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids' | 'config'>

/** "Send" on the feedback sheet. `userAgent` comes from the request, never from the client. */
export const makeSendFeedback =
  ({ uow, clock, ids, config }: Deps) =>
  (actor: HouseActor, input: NewFeedback, request: { readonly userAgent?: string | null } = {}) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      if (!by) return err('not_found')
      const r = makeFeedback(input, {
        id: ids.newId(),
        houseId: actor.houseId,
        by,
        now: clock.now(),
        appVersion: config.appVersion,
        userAgent: request.userAgent ?? null,
      })
      if (!r.ok) return r
      await repos.feedback.add(r.value)
      return ok({ id: r.value.id })
    })
