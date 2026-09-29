// Human wording for times and dates, in the house time zone. `now` is passed in.

import {
  calendarDaysBetween,
  daysBetween,
  localDateOf,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  type Instant,
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
