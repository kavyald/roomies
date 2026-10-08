// Time primitives. The current time is never read here: callers pass `now` in (ARCHITECTURE §4.1).
// Time-zone math uses the built-in Intl API, so the domain imports nothing.

import { err, ok, type Result } from './result'

/** A point in time, independent of any time zone. */
export type Instant = { readonly epochMs: number }

/** A calendar date in the house time zone, "2026-09-29". */
export type LocalDate = `${number}-${number}-${number}`

/** A wall-clock time in the house time zone, "09:30" (24-hour). */
export type LocalTime = `${number}:${number}`

/** A due date, needed-by date, or scheduled time. No time means "some time that day". */
export type When = { readonly date: LocalDate; readonly time?: LocalTime }

export const MS_PER_MINUTE = 60_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000

// ---- instants --------------------------------------------------------------

export const instant = (epochMs: number): Instant => ({ epochMs })

export const instantFromIso = (iso: string): Result<Instant, 'invalid'> => {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? err('invalid') : ok(instant(ms))
}

export const toIso = (i: Instant): string => new Date(i.epochMs).toISOString()

export const plusMs = (i: Instant, ms: number): Instant => instant(i.epochMs + ms)

export const compareInstants = (a: Instant, b: Instant): number => a.epochMs - b.epochMs

export const isBefore = (a: Instant, b: Instant): boolean => a.epochMs < b.epochMs

// ---- local dates and times -------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const splitDate = (d: LocalDate): [number, number, number] => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return [y, m, day]
}

const dateFromUtcMs = (ms: number): LocalDate =>
  new Date(ms).toISOString().slice(0, 10) as LocalDate

const utcMsOfDate = (d: LocalDate): number => {
  const [y, m, day] = splitDate(d)
  return Date.UTC(y, m - 1, day)
}

export const parseLocalDate = (s: string): Result<LocalDate, 'invalid'> => {
  const m = DATE_RE.exec(s)
  if (!m) return err('invalid')
  // Reject dates that don't exist, like 2026-02-30.
  return dateFromUtcMs(utcMsOfDate(s as LocalDate)) === s ? ok(s as LocalDate) : err('invalid')
}

export const parseLocalTime = (s: string): Result<LocalTime, 'invalid'> =>
  TIME_RE.test(s) ? ok(s as LocalTime) : err('invalid')

export const addDays = (d: LocalDate, n: number): LocalDate =>
  dateFromUtcMs(utcMsOfDate(d) + n * MS_PER_DAY)

/** Calendar days from `from` to `to` (negative if `to` is earlier). */
export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  Math.round((utcMsOfDate(to) - utcMsOfDate(from)) / MS_PER_DAY)

/** 0 = Sunday … 6 = Saturday. */
export const dayOfWeek = (d: LocalDate): number => new Date(utcMsOfDate(d)).getUTCDay()

// ---- time zones ------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (tz: string): Intl.DateTimeFormat => {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

export const isTimeZone = (tz: string): boolean => {
  try {
    formatterFor(tz)
    return true
  } catch {
    return false
  }
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number }

const wallOf = (epochMs: number, tz: string): Wall => {
  const parts: Record<string, number> = {}
  for (const p of formatterFor(tz).formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    y: parts.year!,
    mo: parts.month!,
    d: parts.day!,
    h: parts.hour!,
    mi: parts.minute!,
    s: parts.second!,
  }
}

const wallAsUtcMs = (w: Wall): number => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)

/** The zone's offset from UTC at `epochMs`, in ms (New York in winter: −5h). */
export const offsetMs = (epochMs: number, tz: string): number => {
  const wholeSecond = epochMs - (((epochMs % 1000) + 1000) % 1000)
  return wallAsUtcMs(wallOf(wholeSecond, tz)) - wholeSecond
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export const localDateOf = (i: Instant, tz: string): LocalDate => {
  const w = wallOf(i.epochMs, tz)
  return `${w.y}-${pad2(w.mo)}-${pad2(w.d)}` as LocalDate
}

export const localTimeOf = (i: Instant, tz: string): LocalTime => {
  const w = wallOf(i.epochMs, tz)
  return `${pad2(w.h)}:${pad2(w.mi)}` as LocalTime
}

/**
 * The instant a wall-clock time happens in `tz`.
 * Across daylight saving it follows the "compatible" rule (as Temporal does): a time skipped by
 * spring-forward moves forward by the gap, and a time that happens twice at fall-back takes the
 * earlier one.
 */
export const instantAt = (date: LocalDate, time: LocalTime, tz: string): Instant => {
  const [y, mo, d] = splitDate(date)
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi)

  const before = offsetMs(wall - MS_PER_DAY, tz)
  const after = offsetMs(wall + MS_PER_DAY, tz)
  const candidates = [...new Set([wall - before, wall - after])]
    .filter((t) => t + offsetMs(t, tz) === wall)
    .sort((a, b) => a - b)

  // No candidate means the time falls in a spring-forward gap: shift it forward by the gap.
  return instant(candidates[0] ?? wall - before)
}

/** Midnight at the start of `date` in `tz` (not always 00:00 UTC-wise, and not always 24h long). */
export const startOfDay = (date: LocalDate, tz: string): Instant =>
  instantAt(date, '00:00' as LocalTime, tz)

/** The instant a `When` refers to; a date without a time means the start of that day. */
export const instantOfWhen = (w: When, tz: string): Instant =>
  w.time ? instantAt(w.date, w.time, tz) : startOfDay(w.date, tz)

/** Calendar days between two instants, as seen on the house's calendar. */
export const calendarDaysBetween = (from: Instant, to: Instant, tz: string): number =>
  daysBetween(localDateOf(from, tz), localDateOf(to, tz))
