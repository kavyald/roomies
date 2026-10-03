// Human wording for times and dates, in the house time zone. `now` is passed in.

import {
  calendarDaysBetween,
  daysBetween,
  localDateOf,
  localTimeOf,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  type Instant,
  type LocalDate,
  type LocalTime,
  type When,
} from './time'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Just now", "5m ago", "3h ago", "Yesterday", "Mon", "Sep 3", "Sep 3, 2025". */
export const relativeTime = (at: Instant, now: Instant, tz: string): string => {
  const ms = now.epochMs - at.epochMs
  if (ms < MS_PER_MINUTE) return 'Just now'
  const days = calendarDaysBetween(at, now, tz)
  if (days === 0) {
    return ms < MS_PER_HOUR
      ? `${Math.floor(ms / MS_PER_MINUTE)}m ago`
      : `${Math.floor(ms / MS_PER_HOUR)}h ago`
  }
  if (days === 1) return 'Yesterday'
  const [y, m, d] = localDateOf(at, tz).split('-').map(Number) as [number, number, number]
  if (days < 7) return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
  const [nowYear] = localDateOf(now, tz).split('-').map(Number) as [number]
  const monthDay = `${MONTHS[m - 1]} ${d}`
  return y === nowYear ? monthDay : `${monthDay}, ${y}`
}

/**
 * A date the way the house says it: "Today", "Tomorrow", "Thu", "Oct 3" (next year: "Jan 5,
 * 2027"), with the time after it when there is one ("Thu 10:00").
 */
export const describeWhen = (when: When, now: Instant, tz: string): string => {
  const today = localDateOf(now, tz)
  const days = daysBetween(today, when.date)
  const [y, m, d] = when.date.split('-').map(Number) as [number, number, number]
  const [nowYear] = today.split('-').map(Number) as [number]
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : days > 1 && days < 7
            ? WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
            : y === nowYear
              ? `${MONTHS[m - 1]} ${d}`
              : `${MONTHS[m - 1]} ${d}, ${y}`
  return when.time ? `${day} ${when.time}` : day
}

/** A day heading in the activity log: "Today", "Yesterday", "Mon, Sep 28", "Sep 28, 2025". */
export const dayHeading = (date: LocalDate, now: Instant, tz: string): string => {
  const today = localDateOf(now, tz)
  const days = daysBetween(date, today)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [nowYear] = today.split('-').map(Number) as [number]
  if (y !== nowYear) return `${MONTHS[m - 1]} ${d}, ${y}`
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`
}

/** A line's time under its day heading: "Just now", "5m ago", "3h ago" today; "18:40" before. */
export const feedTime = (at: Instant, now: Instant, tz: string): string =>
  calendarDaysBetween(at, now, tz) === 0 ? relativeTime(at, now, tz) : localTimeOf(at, tz)

/** A clock time the short way: "10pm", "8:30am", "12am" (midnight), "12pm" (noon). */
export const clockTime = (t: LocalTime): string => {
  const [h, m] = t.split(':').map(Number) as [number, number]
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`}${h < 12 ? 'am' : 'pm'}`
}
