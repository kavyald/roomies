// Reminders (PRD §11, ARCHITECTURE §7.3 `runReminders`): what's coming up for whom, as notification
// drafts with a dedupe key so running the job again sends nothing new. Pure: `today` and
// `tomorrow` are the house's calendar days, passed in.

import type { Member, Room } from './house'
import type { Draft, Recipient } from './notifications'
import type { Item } from './items'
import type { Poll } from './polls'
import { isPollOpen } from './polls'
import {
  listOf,
  PERIOD_WORDS,
  periodStart,
  rotationOrder,
  routineHolder,
  type Routine,
} from './routines'
import { isRunOpen, type Run } from './runs'
import { addDays, localDateOf, type Instant, type LocalDate } from './time'

export type ReminderInput = {
  readonly houseId: string
  readonly tz: string
  readonly now: Instant
  readonly items: readonly Item[]
  readonly polls: readonly Poll[]
  readonly runs: readonly Run[]
  readonly people: readonly Recipient[]
  readonly runLabel: (r: Run) => string
  readonly routines: readonly Routine[]
  readonly rooms: readonly Room[]
  readonly members: readonly Member[]
}

/**
 * One message per person whose routines change hands today, whatever they hold: "You have the
 * kitchen and dining this week". Only routines that take turns, and only on the first day of the
 * period, so adding a routine midweek says nothing.
 */
const handoversFor = (input: ReminderInput, today: LocalDate, home: string): Draft[] => {
  if (rotationOrder(input.members).length < 2) return []
  const byHolder = new Map<string, { routine: Routine; names: string[] }[]>()
  for (const routine of input.routines) {
    if (routine.removedAt || routine.fixedMember) continue
    if (periodStart(routine, today) !== today) continue
    const holder = routineHolder(routine, input.members, today)
    if (!holder) continue
    const names = input.rooms
      .filter((r) => r.routineId === routine.id && !r.archivedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => r.name.toLowerCase())
    byHolder.set(holder, [
      ...(byHolder.get(holder) ?? []),
      { routine, names: names.length > 0 ? names : [routine.name.toLowerCase()] },
    ])
  }
  return [...byHolder].map(([holder, held]) => {
    const when = new Set(held.map((h) => h.routine.resets))
    const period = when.size === 1 ? PERIOD_WORDS[held[0]!.routine.resets] : 'for now'
    const [first, ...rest] = held.flatMap((h) => h.names)
    return {
      userId: holder as Recipient['userId'],
      category: 'assigned' as const,
      title: `You have the ${listOf([first!, ...rest])} ${period}`,
      body: "It's your turn to look after them.",
      url: `${home}/chores`,
      dedupeKey: `handover:${input.houseId}:${today}:${holder}`,
    }
  })
}

/** Day-before and day-of reminders; nothing for things already past (no nagging, FRONTEND §7). */
export const remindersFor = (input: ReminderInput): Draft[] => {
  const today = localDateOf(input.now, input.tz)
  const tomorrow = addDays(today, 1)
  const home = `/h/${input.houseId}`
  const which = (d: LocalDate | null | undefined) =>
    d === today ? 'today' : d === tomorrow ? 'tomorrow' : null
  const drafts: Draft[] = []

  // Your tasks, the day before and the day of.
  for (const item of input.items) {
    if (item.archivedAt || !item.assignee) continue
    if (item.category !== 'task' || item.done) continue
    const date = item.when?.date
    const when = which(date)
    if (!when || !date) continue
    drafts.push({
      userId: item.assignee,
      category: 'due',
      title: `${when === 'today' ? 'Today' : 'Tomorrow'}: ${item.title}`,
      body: when === 'today' ? "It's on you today." : "Just a heads-up: it's on you tomorrow.",
      url: `${home}/i/${item.id}`,
      dedupeKey: `due:${item.id}:${date}:${when}:${item.assignee}`,
    })
  }

  // Polls closing tomorrow: everyone who hasn't voted yet.
  for (const poll of input.polls) {
    if (!poll.closesAt || !isPollOpen(poll, input.now)) continue
    if (localDateOf(poll.closesAt, input.tz) !== tomorrow) continue
    const voted = new Set(poll.votes.map((v) => v.user))
    for (const p of input.people) {
      if (voted.has(p.userId)) continue
      drafts.push({
        userId: p.userId,
        category: 'polls',
        title: `Closing tomorrow: ${poll.question}`,
        body: "Your vote isn't in yet.",
        url: `${home}/p/${poll.id}`,
        dedupeKey: `poll-closing:${poll.id}:${tomorrow}:${p.userId}`,
      })
    }
  }

  // Runs and visits with a date tomorrow: everyone.
  for (const run of input.runs) {
    if (run.kind === 'request' || !isRunOpen(run) || run.when?.date !== tomorrow) continue
    const label = input.runLabel(run)
    for (const p of input.people) {
      drafts.push({
        userId: p.userId,
        category: 'runs',
        title: `Tomorrow: ${label}`,
        body:
          run.kind === 'batch'
            ? 'Add anything before it goes?'
            : `${label} is tomorrow${run.when.time ? ` at ${run.when.time}` : ''}.`,
        url: `${home}/r/${run.id}`,
        dedupeKey: `run-tomorrow:${run.id}:${run.when.date}:${p.userId}`,
      })
    }
  }
  drafts.push(...handoversFor(input, today, home))
  return drafts
}
