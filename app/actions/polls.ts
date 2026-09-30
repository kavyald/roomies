'use server'

import { houseEnv } from './env'
import { makeAddPollOption, makeClosePoll, makeCreatePoll, makeVote } from '@/lib/app/polls'
import type { HouseId, ItemId, OptionId, PollId } from '@/lib/domain/ids'
import { instantFromIso } from '@/lib/domain/time'
import {
  addPollOptionSchema,
  closePollSchema,
  createPollSchema,
  voteSchema,
} from '@/lib/schemas/polls'
import { makeAction } from '@/lib/server/action'

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
    houseEnv(houseId),
  )(input)
}

export async function voteAction(houseId: HouseId, input: unknown) {
  return makeAction(
    voteSchema,
    (deps, actor, i) =>
      makeVote(deps)(actor, { pollId: i.pollId as PollId, optionId: i.optionId as OptionId }),
    houseEnv(houseId),
  )(input)
}

export async function addPollOptionAction(houseId: HouseId, input: unknown) {
  return makeAction(
    addPollOptionSchema,
    (deps, actor, i) =>
      makeAddPollOption(deps)(actor, { pollId: i.pollId as PollId, label: i.label, note: i.note }),
    houseEnv(houseId),
  )(input)
}

export async function closePollAction(houseId: HouseId, input: unknown) {
  return makeAction(
    closePollSchema,
    (deps, actor, i) => makeClosePoll(deps)(actor, { pollId: i.pollId as PollId }),
    houseEnv(houseId),
  )(input)
}
