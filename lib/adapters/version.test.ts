// T50: an item's or run's version is its updated_at to the microsecond (ARCHITECTURE §7.5). The
// server reads it exactly from SQL; the browser parses it from PostgREST's ISO text, and both
// must agree (the contract suites check the server side against Postgres).
import { describe, expect, it } from 'vitest'
import { versionOf } from './postgres/mappers'

const micros = (iso: string, extra: number) => String(Date.parse(iso) * 1000 + extra)

describe('versionOf', () => {
  it('reads microseconds since the epoch from Postgres JSON timestamps', () => {
    expect(versionOf({ updated_at: '2026-10-02T14:43:27.497723+00:00' })).toBe(
      micros('2026-10-02T14:43:27Z', 497723),
    )
    // Postgres drops trailing zeros, and the whole fraction on an exact second.
    expect(versionOf({ updated_at: '2026-10-02T14:43:27.4977+00:00' })).toBe(
      micros('2026-10-02T14:43:27Z', 497700),
    )
    expect(versionOf({ updated_at: '2026-10-02T14:43:27+00:00' })).toBe(
      micros('2026-10-02T14:43:27Z', 0),
    )
    // Other offsets, with or without minutes or a colon.
    expect(versionOf({ updated_at: '2026-10-02T20:13:27.000001+05:30' })).toBe(
      micros('2026-10-02T14:43:27Z', 1),
    )
    expect(versionOf({ updated_at: '2026-10-02T06:43:27.5-08' })).toBe(
      micros('2026-10-02T14:43:27Z', 500000),
    )
    expect(versionOf({ updated_at: '2026-10-02T06:43:27.5-0800' })).toBe(
      micros('2026-10-02T14:43:27Z', 500000),
    )
    expect(versionOf({ updated_at: '2026-10-02T14:43:27.25Z' })).toBe(
      micros('2026-10-02T14:43:27Z', 250000),
    )
  })

  it('two saves in the same millisecond still differ', () => {
    expect(versionOf({ updated_at: '2026-10-02T14:43:27.497001+00:00' })).not.toBe(
      versionOf({ updated_at: '2026-10-02T14:43:27.497002+00:00' }),
    )
  })

  it('prefers the exact version a server read selected; a JS Date gives none', () => {
    expect(versionOf({ updated_at: new Date(), version: '1759416207497723' })).toBe(
      '1759416207497723',
    )
    expect(versionOf({ updated_at: new Date() })).toBeUndefined()
    expect(versionOf({ updated_at: 'not a time' })).toBeUndefined()
  })
})
