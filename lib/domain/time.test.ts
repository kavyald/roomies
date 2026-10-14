import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarDaysBetween,
  dayOfWeek,
  daysBetween,
  instant,
  instantAt,
  instantFromIso,
  instantOfWhen,
  isBefore,
  isTimeZone,
  localDateOf,
  localTimeOf,
  MS_PER_HOUR,
  offsetMs,
  parseLocalDate,
  parseLocalTime,
  plusMs,
  startOfDay,
  toIso,
  type LocalDate,
  type LocalTime,
} from './time'

const NY = 'America/New_York'
const SYD = 'Australia/Sydney'
const d = (s: string) => s as LocalDate
const t = (s: string) => s as LocalTime
const iso = (s: string) => {
  const r = instantFromIso(s)
  if (!r.ok) throw new Error(s)
  return r.value
}

describe('instants', () => {
  it('round-trips ISO strings', () => {
    expect(toIso(iso('2026-09-29T12:00:00.000Z'))).toBe('2026-09-29T12:00:00.000Z')
    expect(instantFromIso('not a date')).toEqual({ ok: false, error: 'invalid' })
  })

  it('adds and compares', () => {
    const a = instant(1000)
    expect(plusMs(a, 500)).toEqual(instant(1500))
    expect(isBefore(a, plusMs(a, 1))).toBe(true)
    expect(isBefore(a, a)).toBe(false)
  })
})

describe('local dates', () => {
  it('parses real dates only', () => {
    expect(parseLocalDate('2026-02-28').ok).toBe(true)
    expect(parseLocalDate('2028-02-29').ok).toBe(true)
    expect(parseLocalDate('2026-02-29').ok).toBe(false)
    expect(parseLocalDate('2026-13-01').ok).toBe(false)
    expect(parseLocalDate('26-1-1').ok).toBe(false)
  })

  it('parses 24-hour times', () => {
    expect(parseLocalTime('00:00').ok).toBe(true)
    expect(parseLocalTime('23:59').ok).toBe(true)
    expect(parseLocalTime('24:00').ok).toBe(false)
    expect(parseLocalTime('9:30').ok).toBe(false)
  })

  it('does calendar arithmetic across month, year, and DST boundaries', () => {
    expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01')
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(d('2026-03-08'), -1)).toBe('2026-03-07')
    expect(daysBetween(d('2026-03-01'), d('2026-03-15'))).toBe(14)
    expect(daysBetween(d('2026-11-15'), d('2026-11-01'))).toBe(-14)
    expect(dayOfWeek(d('2026-09-29'))).toBe(2) // a Tuesday
  })
})

describe('time zones', () => {
  it('knows real zones', () => {
    expect(isTimeZone(NY)).toBe(true)
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
  })

  it('reads the local date and time of an instant', () => {
    const i = iso('2026-09-30T02:30:00Z') // 22:30 on the 29th in New York (EDT)
    expect(localDateOf(i, NY)).toBe('2026-09-29')
    expect(localTimeOf(i, NY)).toBe('22:30')
    expect(localDateOf(i, 'Asia/Kolkata')).toBe('2026-09-30')
    expect(localTimeOf(i, 'Asia/Kolkata')).toBe('08:00')
  })

  it('reports offsets on both sides of daylight saving', () => {
    expect(offsetMs(iso('2026-01-15T12:00:00Z').epochMs, NY)).toBe(-5 * MS_PER_HOUR)
    expect(offsetMs(iso('2026-07-15T12:00:00Z').epochMs, NY)).toBe(-4 * MS_PER_HOUR)
    expect(offsetMs(iso('2026-07-15T12:00:00Z').epochMs, 'Asia/Kolkata')).toBe(5.5 * MS_PER_HOUR)
  })

  it('converts ordinary wall times', () => {
    expect(toIso(instantAt(d('2026-09-29'), t('09:30'), NY))).toBe('2026-09-29T13:30:00.000Z')
    expect(toIso(instantAt(d('2026-01-15'), t('09:30'), NY))).toBe('2026-01-15T14:30:00.000Z')
    expect(toIso(instantAt(d('2026-09-29'), t('09:30'), 'Asia/Kolkata'))).toBe(
      '2026-09-29T04:00:00.000Z',
    )
  })

  describe('spring forward (New York, 2026-03-08, 02:00 → 03:00)', () => {
    it('moves a skipped time forward by the gap', () => {
      expect(toIso(instantAt(d('2026-03-08'), t('02:30'), NY))).toBe('2026-03-08T07:30:00.000Z')
      expect(localTimeOf(instantAt(d('2026-03-08'), t('02:30'), NY), NY)).toBe('03:30')
    })

    it('keeps times on either side exact', () => {
      expect(toIso(instantAt(d('2026-03-08'), t('01:59'), NY))).toBe('2026-03-08T06:59:00.000Z')
      expect(toIso(instantAt(d('2026-03-08'), t('03:00'), NY))).toBe('2026-03-08T07:00:00.000Z')
    })

    it('makes the day 23 hours long', () => {
      const len = startOfDay(d('2026-03-09'), NY).epochMs - startOfDay(d('2026-03-08'), NY).epochMs
      expect(len).toBe(23 * MS_PER_HOUR)
    })
  })

  describe('fall back (New York, 2026-11-01, 02:00 → 01:00)', () => {
    it('takes the earlier of a repeated time', () => {
      expect(toIso(instantAt(d('2026-11-01'), t('01:30'), NY))).toBe('2026-11-01T05:30:00.000Z')
    })

    it('makes the day 25 hours long', () => {
      const len = startOfDay(d('2026-11-02'), NY).epochMs - startOfDay(d('2026-11-01'), NY).epochMs
      expect(len).toBe(25 * MS_PER_HOUR)
    })
  })

  describe('southern hemisphere (Sydney)', () => {
    it('handles the October spring-forward gap', () => {
      // 2026-10-04 02:00 → 03:00 AEDT
      expect(localTimeOf(instantAt(d('2026-10-04'), t('02:30'), SYD), SYD)).toBe('03:30')
    })

    it('takes the earlier of a repeated April time', () => {
      // 2026-04-05 03:00 AEDT → 02:00 AEST; 02:30 happens at 15:30Z (AEDT) and 16:30Z (AEST)
      expect(toIso(instantAt(d('2026-04-05'), t('02:30'), SYD))).toBe('2026-04-04T15:30:00.000Z')
    })
  })

  it('reads a When as the start of its day when it has no time', () => {
    expect(instantOfWhen({ date: d('2026-11-01') }, NY)).toEqual(startOfDay(d('2026-11-01'), NY))
    expect(toIso(instantOfWhen({ date: d('2026-11-01'), time: t('10:00') }, NY))).toBe(
      '2026-11-01T15:00:00.000Z',
    )
  })

  it('counts calendar days as the house sees them, not 24h blocks', () => {
    // 23:30 → 00:30 the next local day is one calendar day, though only an hour apart.
    const lateNight = instantAt(d('2026-09-29'), t('23:30'), NY)
    expect(calendarDaysBetween(lateNight, plusMs(lateNight, MS_PER_HOUR), NY)).toBe(1)
    // Across fall-back, 9 local days are 9 days even though one of them is 25h long.
    const a = instantAt(d('2026-10-28'), t('08:00'), NY)
    const b = instantAt(d('2026-11-06'), t('08:00'), NY)
    expect(calendarDaysBetween(a, b, NY)).toBe(9)
  })
})
