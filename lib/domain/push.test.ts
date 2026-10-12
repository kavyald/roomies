import { describe, expect, it } from 'vitest'
import { asId, type HouseId, type UserId } from './ids'
import {
  afterAttempt,
  MAX_RETRY_AFTER_MS,
  newSubscription,
  pushPayload,
  RETRY_DELAYS_MS,
  type PushOutcome,
} from './push'
import { instant, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, plusMs } from './time'

const me = asId<'user'>('me') as UserId
const ctx = { id: 's1', userId: me, now: instant(1), userAgent: 'x'.repeat(500) }
const keys = { p256dh: 'p', auth: 'a' }

const sent: PushOutcome = { kind: 'sent' }
const gone: PushOutcome = { kind: 'gone' }
const failed: PushOutcome = { kind: 'failed' }

describe('push', () => {
  it('stores a real https subscription, and refuses anything else', () => {
    const r = newSubscription({ endpoint: 'https://push.example/abc', keys }, ctx)
    expect(r.ok && r.value).toMatchObject({
      endpoint: 'https://push.example/abc',
      keys,
      userId: me,
    })
    expect(r.ok && r.value.userAgent).toHaveLength(400)
    for (const bad of [
      { endpoint: 'http://push.example/abc', keys },
      { endpoint: 'https://', keys },
      { endpoint: 'https://push.example/abc', keys: { p256dh: '', auth: 'a' } },
    ]) {
      expect(newSubscription(bad, ctx)).toEqual({ ok: false, error: 'invalid_subscription' })
    }
  })

  it('carries the title, body, and where tapping goes', () => {
    const m = {
      id: 1,
      userId: me,
      houseId: asId<'house'>('h') as HouseId,
      category: 'assigned' as const,
      title: 'For you: Leak',
      body: 'Kavya asked you to take this on.',
      url: '/h/h/i/leak',
      sendAfter: instant(0),
      attempts: 0,
    }
    expect(JSON.parse(pushPayload(m))).toEqual({
      title: 'For you: Leak',
      body: 'Kavya asked you to take this on.',
      url: '/h/h/i/leak',
      tag: 'assigned:/h/h/i/leak',
    })
  })

  it('a message is delivered if any browser took it; nothing to retry is final', () => {
    const now = instant(0)
    expect(afterAttempt([gone, sent], 0, now)).toEqual({ kind: 'done', error: null })
    expect(afterAttempt([], 0, now)).toEqual({ kind: 'done', error: 'no_subscription' })
    expect(afterAttempt([gone, gone], 0, now)).toEqual({
      kind: 'done',
      error: 'subscriptions_gone',
    })
  })

  it('a passing failure is tried again after 5 min, 30 min and 2 h, then given up on', () => {
    const now = instant(1_000_000)
    expect(RETRY_DELAYS_MS.map((_, i) => afterAttempt([gone, failed], i, now))).toEqual([
      { kind: 'retry', at: plusMs(now, 5 * MS_PER_MINUTE), error: 'push_failed' },
      { kind: 'retry', at: plusMs(now, 30 * MS_PER_MINUTE), error: 'push_failed' },
      { kind: 'retry', at: plusMs(now, 2 * MS_PER_HOUR), error: 'push_failed' },
    ])
    expect(afterAttempt([failed], RETRY_DELAYS_MS.length, now)).toEqual({
      kind: 'done',
      error: 'push_failed',
    })
  })

  it('waits as long as the push service asked, up to a limit, but never less than the schedule', () => {
    const now = instant(0)
    const asked = (ms: number): PushOutcome => ({ kind: 'failed', retryAfterMs: ms })
    expect(afterAttempt([asked(MS_PER_HOUR), failed], 0, now)).toMatchObject({
      at: plusMs(now, MS_PER_HOUR),
    })
    expect(afterAttempt([asked(MS_PER_MINUTE)], 0, now)).toMatchObject({
      at: plusMs(now, 5 * MS_PER_MINUTE),
    })
    expect(afterAttempt([asked(MS_PER_DAY)], 0, now)).toMatchObject({
      at: plusMs(now, MAX_RETRY_AFTER_MS),
    })
  })
})
