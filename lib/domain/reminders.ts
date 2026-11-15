// Reminders (PRD §11, ARCHITECTURE §7.3 `runReminders`): what's coming up for whom, as notification
// drafts with a dedupe key so running the job again sends nothing new. Pure: `today` and
// `tomorrow` are the house's calendar days, passed in.

import type { Member, Room } from './house'
import type { Draft, Recipient } from './notifications'
import type { Chore, Item } from './items'
import type { Poll } from './polls'
import { isPollOpen } from './polls'
import {
  choreOwner,
  listOf,
  nextPeriodStart,
  PERIOD_WORDS,
  periodStart,
  rotationOrder,
  routineHolder,
  routineProgress,
  type Routine,
} from './routines'
import { isRunOpen, type Run } from './runs'
import {
  addDays,
  instantAt,
  localDateOf,
  type Instant,
  type LocalDate,
  type LocalTime,
} from './time'

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

/** A routine's rooms in house order, lower case ("kitchen", "dining"); its name if it has none. */
const roomNames = (input: ReminderInput, routine: Routine): string[] => {
  const names = input.rooms
    .filter((r) => r.routineId === routine.id && !r.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => r.name.toLowerCase())
  return names.length > 0 ? names : [routine.name.toLowerCase()]
}

/** "this week" when every routine resets alike, else nothing ("for now" for a handover). */
const periodOf = (held: readonly Routine[]): string | null =>
  new Set(held.map((r) => r.resets)).size === 1 ? PERIOD_WORDS[held[0]!.resets] : null

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
    byHolder.set(holder, [
      ...(byHolder.get(holder) ?? []),
      { routine, names: roomNames(input, routine) },
    ])
  }
  return [...byHolder].map(([holder, held]) => {
    const period = periodOf(held.map((h) => h.routine)) ?? 'for now'
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

/**
 * The last day of a routine's period (T85, owner): one message to whoever holds routines ending
 * today, only for those whose checklist isn't all ticked, and only about the rooms, never what's
 * left (FRONTEND §7). A routine with no chores, or every chore done, says nothing.
 */
const lastDaysFor = (
  input: ReminderInput,
  today: LocalDate,
  home: string,
  expiresAt: Instant,
): Draft[] => {
  const tomorrow = addDays(today, 1)
  const chores = input.items.filter((i): i is Chore => i.category === 'chore' && !i.archivedAt)
  const byHolder = new Map<string, Routine[]>()
  for (const routine of input.routines) {
    if (routine.removedAt || nextPeriodStart(routine, today) !== tomorrow) continue
    const own = chores.filter((c) => choreOwner(c, input.rooms, input.routines)?.id === routine.id)
    const progress = routineProgress(routine, own, today, input.tz)
    if (progress.every((c) => c.done)) continue
    const holder = routineHolder(routine, input.members, today)
    if (!holder) continue
    byHolder.set(holder, [...(byHolder.get(holder) ?? []), routine])
  }
  return [...byHolder].map(([holder, held]) => {
    const period = periodOf(held)
    return {
      userId: holder as Recipient['userId'],
      category: 'due' as const,
      title: `Last day for the ${listOf(held.flatMap((r) => roomNames(input, r)))}${period ? ` ${period}` : ''}`,
      body: 'Still time to tick off the rest, if you get a chance.',
      url: `${home}/chores`,
      dedupeKey: `last-day:${input.houseId}:${today}:${holder}`,
      expiresAt,
    }
  })
}

/**
 * Day-before and day-of reminders (tasks, needs, polls, runs, routines' first and last days); nothing for things already past (no nagging, FRONTEND §7). Each
 * expires when its day ends, so one held overnight by quiet hours isn't pushed a day late (T83);
 * a handover stays true all period, so it doesn't.
 */
export const remindersFor = (input: ReminderInput): Draft[] => {
  const today = localDateOf(input.now, input.tz)
  const tomorrow = addDays(today, 1)
  const home = `/h/${input.houseId}`
  const which = (d: LocalDate | null | undefined) =>
    d === today ? 'today' : d === tomorrow ? 'tomorrow' : null
  // Each says "today" or "tomorrow", so it's stale once today ends (T83).
  const expiresAt = instantAt(tomorrow, '00:00' as LocalTime, input.tz)
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
      expiresAt,
    })
  }

  // Needs with a "needed by" date: everyone, on the day (T85, owner), through their own category.
  for (const item of input.items) {
    if (item.category !== 'need' || item.archivedAt || item.done) continue
    if (item.when?.date !== today) continue
    for (const p of input.people) {
      drafts.push({
        userId: p.userId,
        category: 'needs',
        title: `Needed today: ${item.title}`,
        body: "Today's the day for this one.",
        url: `${home}/i/${item.id}`,
        dedupeKey: `need-today:${item.id}:${today}:${p.userId}`,
        expiresAt,
      })
    }
  }

  // Polls closing tomorrow, and later today (T85): everyone who hasn't voted yet. "Closing today"
  // is stale once the poll closes, so one held by quiet hours past the deadline isn't sent.
  for (const poll of input.polls) {
    if (!poll.closesAt || !isPollOpen(poll, input.now)) continue
    const closes = localDateOf(poll.closesAt, input.tz)
    const when = which(closes)
    if (!when) continue
    const voted = new Set(poll.votes.map((v) => v.user))
    for (const p of input.people) {
      if (voted.has(p.userId)) continue
      drafts.push({
        userId: p.userId,
        category: 'polls',
        title: `${when === 'today' ? 'Closing today' : 'Closing tomorrow'}: ${poll.question}`,
        body: "Your vote isn't in yet.",
        url: `${home}/p/${poll.id}`,
        dedupeKey: `poll-closing:${poll.id}:${closes}:${p.userId}${when === 'today' ? ':today' : ''}`,
        expiresAt: when === 'today' ? poll.closesAt : expiresAt,
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
        expiresAt,
      })
    }
  }
  drafts.push(...handoversFor(input, today, home), ...lastDaysFor(input, today, home, expiresAt))
  return drafts
}
