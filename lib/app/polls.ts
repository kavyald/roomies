// Poll use cases (ARCHITECTURE §7.2 table): load → pure domain function → save the piece that
// changed → record events, in one transaction, acting as the member (RLS applies).

import type { AppDeps, Repos } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { ItemId, OptionId, PollId } from '../domain/ids'
import {
  addPollOption,
  closePoll,
  createPoll,
  reopenPoll,
  setPollDeadline,
  vote,
  withdrawVote,
  type NewPoll,
  type Poll,
  type PollResult,
} from '../domain/polls'
import { err, ok } from '../domain/result'
import type { Instant } from '../domain/time'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>

const loadPoll = async (repos: Repos, actor: HouseActor, id: PollId) => {
  const p = await repos.polls.get(id)
  return p?.houseId === actor.houseId ? p : null
}

/** A question about an item ("Which vacuum?") or on its own ("House name?"). */
export const makeCreatePoll =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: NewPoll) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      if (!by) return err('not_found')
      if (input.itemId) {
        const item = await repos.items.get(input.itemId as ItemId)
        if (item?.houseId !== actor.houseId) return err('not_found')
      }
      const now = clock.now()
      const r = createPoll(input, {
        by,
        now,
        actionId: ids.newId(),
        id: ids.newId(),
        houseId: actor.houseId,
        optionIds: input.options.map(() => ids.newId<'option'>() as OptionId),
      })
      if (!r.ok) return r
      await repos.polls.create(r.value.poll)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })

/** Vote, or change my vote. */
export const makeVote =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId; optionId: OptionId }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll || !by) return err('not_found')
      const now = clock.now()
      const r = vote(poll, input.optionId, { by, now, actionId: ids.newId() })
      if (!r.ok) return r
      await repos.polls.setVote(poll, r.value.vote)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })

/** Anyone adds an option while it's open. */
export const makeAddPollOption =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId; label: string; note?: string }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll || !by) return err('not_found')
      const now = clock.now()
      const r = addPollOption(poll, input, {
        by,
        now,
        actionId: ids.newId(),
        id: ids.newId<'option'>() as OptionId,
      })
      if (!r.ok) return r
      await repos.polls.addOption(poll, r.value.option)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })

/** Anyone can close it; the result is what the votes say. */
export const makeClosePoll =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId }) =>
    uow.run(actor, async (repos) => {
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll) return err('not_found')
      const now = clock.now()
      const r = closePoll(poll, { by: actorUser(actor), now, actionId: ids.newId() })
      if (!r.ok) return r
      await repos.polls.saveState(r.value.poll)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok({ poll: r.value.poll as Poll, result: r.value.result as PollResult })
    })

/** Take my vote back while it's open. */
export const makeWithdrawVote =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll || !by) return err('not_found')
      const now = clock.now()
      const r = withdrawVote(poll, { by, now, actionId: ids.newId() })
      if (!r.ok) return r
      await repos.polls.removeVote(poll, by)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })

/** Anyone can reopen a closed poll; the votes cast before it closed stay. */
export const makeReopenPoll =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll || !by) return err('not_found')
      const now = clock.now()
      const r = reopenPoll(poll, { by, now, actionId: ids.newId() })
      if (!r.ok) return r
      await repos.polls.saveState(r.value.poll)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })

/** Change or clear an open poll's deadline (null clears it). */
export const makeSetPollDeadline =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { pollId: PollId; closesAt: Instant | null }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const poll = await loadPoll(repos, actor, input.pollId)
      if (!poll || !by) return err('not_found')
      const now = clock.now()
      const r = setPollDeadline(poll, input.closesAt, { by, now, actionId: ids.newId() })
      if (!r.ok) return r
      await repos.polls.saveState(r.value.poll)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.poll)
    })
