import { describe, expect, it } from 'vitest'
import { retryAfter } from './web-push'

describe('retryAfter (T84)', () => {
  it('reads seconds into milliseconds, and ignores anything else', () => {
    expect(retryAfter('120')).toBe(120_000)
    expect(retryAfter(undefined)).toBeUndefined()
    expect(retryAfter('')).toBeUndefined()
    expect(retryAfter('0')).toBeUndefined()
    expect(retryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined()
  })
})
