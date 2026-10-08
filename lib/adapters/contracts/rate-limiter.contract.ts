import { describe, expect, it } from 'vitest'
import type { RateLimiter } from '../../app/ports'
import { instant, MS_PER_MINUTE } from '../../domain/time'

export const rateLimiterContract = (name: string, make: () => RateLimiter) =>
  describe(`RateLimiter contract: ${name}`, () => {
    const rule = { limit: 3, windowMs: 10 * MS_PER_MINUTE }
    const t = instant(Date.UTC(2026, 8, 29, 16, 0))

    it('allows up to the limit per window, then refuses; a new window starts fresh', async () => {
      const rl = make()
      const key = `test:${Math.random()}`
      const results = []
      for (let i = 0; i < 4; i++) results.push(await rl.hit(key, rule, t))
      expect(results).toEqual([true, true, true, false])
      expect(await rl.hit(key, rule, instant(t.epochMs + rule.windowMs))).toBe(true)
    })

    it('counts keys separately', async () => {
      const rl = make()
      const a = `test:a:${Math.random()}`
      const b = `test:b:${Math.random()}`
      for (let i = 0; i < 3; i++) await rl.hit(a, rule, t)
      expect(await rl.hit(a, rule, t)).toBe(false)
      expect(await rl.hit(b, rule, t)).toBe(true)
    })
  })
