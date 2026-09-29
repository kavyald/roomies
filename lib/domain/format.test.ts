import { describe, expect, it } from 'vitest'
import { relativeTime } from './format'
import { instantAt, plusMs, type LocalDate, type LocalTime } from './time'

const NY = 'America/New_York'
const at = (d: string, t: string) => instantAt(d as LocalDate, t as LocalTime, NY)
const now = at('2026-09-29', '12:00') // a Tuesday

describe('relativeTime', () => {
  it.each([
    [plusMs(now, -20_000), 'Just now'],
    [at('2026-09-29', '11:55'), '5m ago'],
    [at('2026-09-29', '09:00'), '3h ago'],
    [at('2026-09-29', '00:10'), '11h ago'],
    [at('2026-09-28', '23:50'), 'Yesterday'],
    [at('2026-09-26', '10:00'), 'Sat'],
    [at('2026-09-03', '10:00'), 'Sep 3'],
    [at('2025-12-24', '10:00'), 'Dec 24, 2025'],
  ])('%j → %s', (when, expected) => {
    expect(relativeTime(when, now, NY)).toBe(expected)
  })

  it('counts days on the house calendar, across a DST change', () => {
    const afterFallBack = at('2026-11-02', '08:00')
    expect(relativeTime(at('2026-11-01', '00:30'), afterFallBack, NY)).toBe('Yesterday')
  })
})
