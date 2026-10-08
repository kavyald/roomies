// The calendar (PRD §6.7, FRONTEND §5.10): anything with a date (open tasks, needs with a
// needed-by date, and batches and visits with a date) laid out by day. Pure.

import type { Item, Need, Task } from './items'
import { isRunOpen, type Batch, type Run, type Visit } from './runs'
import { addDays, dayOfWeek, type LocalDate, type When } from './time'

export type CalendarEntry =
  | { readonly kind: 'item'; readonly when: When; readonly item: Need | Task }
  | { readonly kind: 'run'; readonly when: When; readonly run: Batch | Visit }

const timeKey = (w: When) => w.time ?? '99:99' // a date-only entry comes after the timed ones

/** Everything open with a date in [from, to] (inclusive), by date then time. */
export const calendarEntries = (
  items: readonly Item[],
  runs: readonly Run[],
  from: LocalDate,
  to: LocalDate,
): CalendarEntry[] => {
  const inRange = (w: When | undefined): w is When => !!w && w.date >= from && w.date <= to
  const fromItems = items.flatMap((i): CalendarEntry[] =>
    i.category !== 'chore' && !i.done && !i.archivedAt && inRange(i.when)
      ? [{ kind: 'item', when: i.when, item: i }]
      : [],
  )
  const fromRuns = runs.flatMap((r): CalendarEntry[] =>
    r.kind !== 'request' && isRunOpen(r) && inRange(r.when)
      ? [{ kind: 'run', when: r.when, run: r }]
      : [],
  )
  return [...fromItems, ...fromRuns].sort(
    (a, b) =>
      a.when.date.localeCompare(b.when.date) || timeKey(a.when).localeCompare(timeKey(b.when)),
  )
}

/** Coming up on Home: today and the six days after it. */
export const comingUp = (
  items: readonly Item[],
  runs: readonly Run[],
  today: LocalDate,
): CalendarEntry[] => calendarEntries(items, runs, today, addDays(today, 6))

/** Entries grouped by day, for the month grid's dots and the day list. */
export const byDay = (
  entries: readonly CalendarEntry[],
): ReadonlyMap<LocalDate, CalendarEntry[]> => {
  const m = new Map<LocalDate, CalendarEntry[]>()
  for (const e of entries) m.set(e.when.date, [...(m.get(e.when.date) ?? []), e])
  return m
}

/** "2026-09" → its first and last day. */
export const monthRange = (month: string): { first: LocalDate; last: LocalDate } => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = `${month}-01` as LocalDate
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { first, last: addDays(next as LocalDate, -1) }
}

/** The month before or after. */
export const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const i = y * 12 + (m - 1) + by
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** The month as weeks (Sunday first), with null for days outside it. */
export const monthGrid = (month: string): (LocalDate | null)[][] => {
  const { first, last } = monthRange(month)
  const cells: (LocalDate | null)[] = Array.from({ length: dayOfWeek(first) }, () => null)
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}
