import { describe, expect, it } from 'vitest'
import { outcomeOf, retryAfter } from './web-push'

describe('retryAfter (T84)', () => {
  it('reads seconds into milliseconds, and ignores anything else', () => {
    expect(retryAfter('120')).toBe(120_000)
    expect(retryAfter(undefined)).toBeUndefined()
    expect(retryAfter('')).toBeUndefined()
    expect(retryAfter('0')).toBeUndefined()
    expect(retryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined()
  })
})

describe('outcomeOf (T84)', () => {
  it('drops gone browsers, retries what may pass, and gives up on other refusals', () => {
    expect(outcomeOf(410)).toEqual({ kind: 'gone' })
    expect(outcomeOf(404)).toEqual({ kind: 'gone' })
    expect(outcomeOf(503, '60')).toEqual({ kind: 'failed', retryAfterMs: 60_000 })
    expect(outcomeOf(429)).toEqual({ kind: 'failed' })
    expect(outcomeOf(undefined)).toEqual({ kind: 'failed' })
    expect(outcomeOf(403)).toEqual({ kind: 'rejected' })
    expect(outcomeOf(413)).toEqual({ kind: 'rejected' })
  })
})
