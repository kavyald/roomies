// Polls (PRD §6.4, ARCHITECTURE §6.3): a question and two or more options, about an item or on
// its own. Anyone adds options and votes while it's open; the most votes wins, and a tie is a tie.
// Pure: ids, time and the actor come in as arguments.

import type { DomainEvent } from './events'
import type { ActionId, HouseId, ItemId, OptionId, PollId, UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant } from './time'

export type PollOption = {
  readonly id: OptionId
  readonly label: string
  readonly note?: string
  readonly addedBy: UserId
  readonly addedAt: Instant
}
export type Vote = { readonly user: UserId; readonly option: OptionId; readonly at: Instant }

export type Poll = {
  readonly id: PollId
  readonly houseId: HouseId
  readonly question: string
  readonly itemId?: ItemId
  readonly options: readonly PollOption[]
  readonly votes: readonly Vote[]
  readonly closesAt?: Instant
  readonly createdBy: UserId
  readonly createdAt: Instant
  readonly state: { readonly open: true } | { readonly open: false; readonly closedAt: Instant }
}

export type PollResult =
  | { readonly winner: OptionId; readonly votes: number; readonly runnerUp: number }
  | { readonly tie: readonly OptionId[]; readonly votes: number }
  | { readonly noVotes: true }

export const MAX_QUESTION = 200
export const MAX_LABEL = 80
export const MAX_OPTION_NOTE = 280

type Ctx = { readonly by: UserId; readonly now: Instant; readonly actionId: ActionId }

const sameLabel = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/** Votes per option, in the options' order. */
export const tally = (p: Poll): { option: OptionId; votes: number }[] =>
  p.options.map((o) => ({ option: o.id, votes: p.votes.filter((v) => v.option === o.id).length }))

/** The most votes wins; tied top options are a tie; no votes is no result (D3). */
export const resultOf = (p: Poll): PollResult => {
  const counts = tally(p).sort((a, b) => b.votes - a.votes)
  const top = counts[0]?.votes ?? 0
  if (top === 0) return { noVotes: true }
  const leaders = counts.filter((c) => c.votes === top).map((c) => c.option)
  if (leaders.length > 1) return { tie: leaders, votes: top }
  return { winner: leaders[0]!, votes: top, runnerUp: counts[1]?.votes ?? 0 }
}

type NewOption = { readonly label: string; readonly note?: string }
export type NewPoll = {
  readonly question: string
  readonly itemId?: ItemId
  readonly options: readonly NewOption[]
  readonly closesAt?: Instant
}

const cleanOption = (o: NewOption) => ({
  label: o.label.trim(),
  note: o.note?.trim() || undefined,
})

type OptionError = 'empty_label' | 'label_too_long' | 'note_too_long'
const checkOption = (o: { label: string; note?: string }): OptionError | null =>
  !o.label
    ? 'empty_label'
    : o.label.length > MAX_LABEL
      ? 'label_too_long'
      : o.note && o.note.length > MAX_OPTION_NOTE
        ? 'note_too_long'
        : null

/** A question with two or more options (blank option rows are ignored). */
export const createPoll = (
  input: NewPoll,
  ctx: Ctx & {
    readonly id: PollId
    readonly houseId: HouseId
    readonly optionIds: readonly OptionId[]
  },
): Result<
  { poll: Poll; events: DomainEvent[] },
  'empty_question' | 'question_too_long' | 'needs_two_options' | 'duplicate_label' | OptionError
> => {
  const question = input.question.trim()
  if (!question) return err('empty_question')
  if (question.length > MAX_QUESTION) return err('question_too_long')
  const options = input.options.map(cleanOption).filter((o) => o.label)
  if (options.length < 2) return err('needs_two_options')
  for (const o of options) {
    const bad = checkOption(o)
    if (bad) return err(bad)
  }
  if (options.some((o, i) => options.findIndex((x) => sameLabel(x.label, o.label)) !== i))
    return err('duplicate_label')
  const poll: Poll = {
    id: ctx.id,
    houseId: ctx.houseId,
    question,
    ...(input.itemId && { itemId: input.itemId }),
    options: options.map((o, i) => ({
      id: ctx.optionIds[i]!,
      label: o.label,
      ...(o.note && { note: o.note }),
      addedBy: ctx.by,
      addedAt: ctx.now,
    })),
    votes: [],
    ...(input.closesAt && { closesAt: input.closesAt }),
    createdBy: ctx.by,
    createdAt: ctx.now,
    state: { open: true },
  }
  return ok({
    poll,
    events: [
      {
        kind: 'poll.created',
        pollId: poll.id,
        ...(poll.itemId && { itemId: poll.itemId }),
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** Whether a poll still takes options and votes (closed, or past its deadline, it doesn't). */
export const isPollOpen = (p: Poll, now: Instant): boolean =>
  p.state.open && (!p.closesAt || now.epochMs < p.closesAt.epochMs)

/** One vote each, changeable until it closes (PRD §6.4). */
export const vote = (
  p: Poll,
  option: OptionId,
  ctx: Ctx,
): Result<
  { poll: Poll; vote: Vote; events: DomainEvent[] },
  'closed' | 'unknown_option' | 'no_change'
> => {
  if (!isPollOpen(p, ctx.now)) return err('closed')
  if (!p.options.some((o) => o.id === option)) return err('unknown_option')
  const mine = p.votes.find((v) => v.user === ctx.by)
  if (mine?.option === option) return err('no_change')
  const next: Vote = { user: ctx.by, option, at: ctx.now }
  const base = { pollId: p.id, optionId: option, actionId: ctx.actionId, by: ctx.by }
  return ok({
    poll: { ...p, votes: [...p.votes.filter((v) => v.user !== ctx.by), next] },
    vote: next,
    events: [
      mine
        ? { ...base, kind: 'poll.vote_changed', changes: { option: [mine.option, option] } }
        : { ...base, kind: 'poll.voted' },
    ],
  })
}

/** Anyone can add an option while it's open; existing votes stay (PRD §6.4). */
export const addPollOption = (
  p: Poll,
  input: NewOption,
  ctx: Ctx & { readonly id: OptionId },
): Result<
  { poll: Poll; option: PollOption; events: DomainEvent[] },
  'closed' | 'duplicate_label' | OptionError
> => {
  if (!isPollOpen(p, ctx.now)) return err('closed')
  const o = cleanOption(input)
  const bad = checkOption(o)
  if (bad) return err(bad)
  if (p.options.some((x) => sameLabel(x.label, o.label))) return err('duplicate_label')
  const option: PollOption = {
    id: ctx.id,
    label: o.label,
    ...(o.note && { note: o.note }),
    addedBy: ctx.by,
    addedAt: ctx.now,
  }
  return ok({
    poll: { ...p, options: [...p.options, option] },
    option,
    events: [
      {
        kind: 'poll.option_added',
        pollId: p.id,
        optionId: option.id,
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** Anyone can close it; the result is recorded with the event. */
export const closePoll = (
  p: Poll,
  ctx: Omit<Ctx, 'by'> & { readonly by: UserId | null },
): Result<{ poll: Poll; result: PollResult; events: DomainEvent[] }, 'already_closed'> => {
  if (!p.state.open) return err('already_closed')
  const result = resultOf(p)
  return ok({
    poll: { ...p, state: { open: false, closedAt: ctx.now } },
    result,
    events: [
      {
        kind: 'poll.closed',
        pollId: p.id,
        ...('winner' in result && { optionId: result.winner }),
        payload: {
          result: 'winner' in result ? 'winner' : 'tie' in result ? 'tie' : 'no_votes',
        },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** "Dyson V8 wins (3–1)", "It's a tie. Talk it out?", "No votes". */
export const resultLine = (p: Poll, r: PollResult): string => {
  if ('noVotes' in r) return 'No votes this time.'
  if ('tie' in r) return "It's a tie. Talk it out?"
  const label = p.options.find((o) => o.id === r.winner)?.label ?? 'An option'
  return `${label} wins (${r.votes}–${r.runnerUp})`
}
