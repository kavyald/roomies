import { describe, expect, it } from 'vitest'
import type { SecurityLog } from '../../app/ports'
import type { SecurityEvent } from '../../domain/security'
import { instant } from '../../domain/time'

/** `read(ip)` returns what was recorded for that IP, oldest first. */
export const securityLogContract = (
  name: string,
  make: () => { log: SecurityLog; read: (ip: string) => Promise<SecurityEvent[]> },
) =>
  describe(`SecurityLog contract: ${name}`, () => {
    const t = instant(Date.UTC(2026, 9, 2, 16, 0))

    it('keeps every refused attempt, in order, with its step and reason', async () => {
      const { log, read } = make()
      const ip = `test:${Math.random()}`
      const events: SecurityEvent[] = [
        { kind: 'invite_refused', reason: 'expired', step: 'join.start', ip, at: t },
        { kind: 'setup_token_refused', step: 'setup.view', ip, at: instant(t.epochMs + 1000) },
        { kind: 'rate_limited', step: 'join.accept', ip, at: instant(t.epochMs + 2000) },
        { kind: 'invite_refused', reason: 'expired', step: 'join.start', ip, at: t },
      ]
      for (const e of events) await log.record(e)
      expect(await read(ip)).toEqual(events)
    })

    it('keeps IPs apart', async () => {
      const { log, read } = make()
      const a = `test:a:${Math.random()}`
      const b = `test:b:${Math.random()}`
      await log.record({ kind: 'rate_limited', step: 'setup.start', ip: a, at: t })
      expect(await read(a)).toHaveLength(1)
      expect(await read(b)).toEqual([])
    })
  })
