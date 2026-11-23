import { describe, expect, it } from 'vitest'
import { serverTiming, timed } from './timing'

describe('Server-Timing (T115)', () => {
  it('writes each part with its duration and, if given, a description', () => {
    expect(
      serverTiming([
        { name: 'session', ms: 1.234, desc: 'Session cookie' },
        { name: 'auth', ms: 14 },
      ]),
    ).toBe('session;dur=1.2;desc="Session cookie", auth;dur=14.0')
  })

  it('never writes a negative duration or a quote that would end the description', () => {
    expect(serverTiming([{ name: 'x', ms: -3, desc: 'say "hi"' }])).toBe('x;dur=0.0;desc="say hi"')
    expect(serverTiming([])).toBe('')
  })

  it('times a piece of work and hands back its result', async () => {
    const [value, ms] = await timed(async () => 42)
    expect(value).toBe(42)
    expect(ms).toBeGreaterThanOrEqual(0)
  })
})
