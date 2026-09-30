'use server'

import { makeAddPollOption, makeClosePoll, makeCreatePoll, makeVote } from '@/lib/app/polls'
import { depsForRequest } from '@/lib/compose'
import type { HouseId, ItemId, OptionId, PollId } from '@/lib/domain/ids'
import { instantFromIso } from '@/lib/domain/time'
import {
  addPollOptionSchema,
  closePollSchema,
  createPollSchema,
  voteSchema,
} from '@/lib/schemas/polls'
import { makeAction } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

// Zod has checked the shapes; the branded ids are just those strings.
export async function createPollAction(houseId: HouseId, input: unknown) {
  return makeAction(
    createPollSchema,
    (deps, actor, i) => {
      const closesAt = i.closesAt ? instantFromIso(i.closesAt) : undefined
      return makeCreatePoll(deps)(actor, {
        question: i.question,
        options: i.options,
        ...(i.itemId && { itemId: i.itemId as ItemId }),
        ...(closesAt?.ok && { closesAt: closesAt.value }),
      })
    },
    env(houseId),
  )(input)
}

export async function voteAction(houseId: HouseId, input: unknown) {
  return makeAction(
    voteSchema,
    (deps, actor, i) =>
      makeVote(deps)(actor, { pollId: i.pollId as PollId, optionId: i.optionId as OptionId }),
    env(houseId),
  )(input)
}

export async function addPollOptionAction(houseId: HouseId, input: unknown) {
  return makeAction(
    addPollOptionSchema,
    (deps, actor, i) =>
      makeAddPollOption(deps)(actor, { pollId: i.pollId as PollId, label: i.label, note: i.note }),
    env(houseId),
  )(input)
}

export async function closePollAction(houseId: HouseId, input: unknown) {
  return makeAction(
    closePollSchema,
    (deps, actor, i) => makeClosePoll(deps)(actor, { pollId: i.pollId as PollId }),
    env(houseId),
  )(input)
}
