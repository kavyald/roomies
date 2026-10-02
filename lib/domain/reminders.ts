// Reminders (PRD §11, ARCHITECTURE §8 `runReminders`): what's coming up for whom, as notification
// drafts with a dedupe key so running the job again sends nothing new. Pure: `today` and
// `tomorrow` are the house's calendar days, passed in.

import type { Draft, Recipient } from './notifications'
import type { Item } from './items'
import type { Poll } from './polls'
import { isPollOpen } from './polls'
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
}

/** When a chore's next turn comes, on the house calendar (null: as needed, or never done). */
export const choreDueDate = (item: Item, tz: string): LocalDate | null =>
  item.category === 'chore' && item.repeatDays && item.lastDone
    ? addDays(localDateOf(item.lastDone.at, tz), item.repeatDays)
    : null

/** Day-before and day-of reminders; nothing for things already past (no nagging, FRONTEND §7). */
export const remindersFor = (input: ReminderInput): Draft[] => {
  const today = localDateOf(input.now, input.tz)
  const tomorrow = addDays(today, 1)
  const home = `/h/${input.houseId}`
  const which = (d: LocalDate | null | undefined) =>
    d === today ? 'today' : d === tomorrow ? 'tomorrow' : null
  const drafts: Draft[] = []

  // Your tasks and chores, the day before and the day of.
  for (const item of input.items) {
    if (item.archivedAt || !item.assignee) continue
    if (item.category === 'need') continue
    if (item.category === 'task' && item.done) continue
    const date = item.category === 'task' ? item.when?.date : choreDueDate(item, input.tz)
    const when = which(date)
    if (!when || !date) continue
    const chore = item.category === 'chore'
    drafts.push({
      userId: item.assignee,
      category: 'due',
      title: `${when === 'today' ? 'Today' : 'Tomorrow'}: ${item.title}`,
      body: chore
        ? `Its turn comes up ${when}.`
        : when === 'today'
          ? "It's on you today."
          : "Just a heads-up: it's on you tomorrow.",
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
  return drafts
}
