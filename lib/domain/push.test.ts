import { describe, expect, it } from 'vitest'
import { asId, type HouseId, type UserId } from './ids'
import { deliveryResult, newSubscription, pushPayload } from './push'
import { instant } from './time'

const me = asId<'user'>('me') as UserId
const ctx = { id: 's1', userId: me, now: instant(1), userAgent: 'x'.repeat(500) }
const keys = { p256dh: 'p', auth: 'a' }

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
    }
    expect(JSON.parse(pushPayload(m))).toEqual({
      title: 'For you: Leak',
      body: 'Kavya asked you to take this on.',
      url: '/h/h/i/leak',
      tag: 'assigned:/h/h/i/leak',
    })
  })

  it('a message is delivered if any browser took it', () => {
    expect(deliveryResult(['gone', 'sent'])).toBeNull()
    expect(deliveryResult([])).toBe('no_subscription')
    expect(deliveryResult(['gone', 'gone'])).toBe('subscriptions_gone')
    expect(deliveryResult(['gone', 'failed'])).toBe('push_failed')
  })
})
