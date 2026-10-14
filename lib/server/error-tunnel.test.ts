import { describe, expect, it, vi } from 'vitest'
import { envelopeUrl, handleTunnel, MAX_ENVELOPE_BYTES } from './error-tunnel'

const DSN = 'https://pubkey@o123.ingest.us.sentry.io/456'
const enc = (s: string) => new TextEncoder().encode(s)
const envelope = (dsn: unknown) =>
  enc(`${JSON.stringify({ dsn, sent_at: 'now' })}\n{"type":"event"}\n{"message":"x"}`)

const env = (send = vi.fn(async () => 200), dsn: string | null = DSN) => ({ dsn, send })

describe('envelopeUrl', () => {
  it("points at the DSN's project envelope endpoint", () => {
    expect(envelopeUrl(DSN)).toBe('https://o123.ingest.us.sentry.io/api/456/envelope/')
    expect(envelopeUrl('https://k@sentry.example.com:9000/sub/7')).toBe(
      'https://sentry.example.com:9000/api/7/envelope/',
    )
    expect(envelopeUrl('https://o1.ingest.sentry.io/1')).toBeNull()
  })
})

describe('handleTunnel', () => {
  it("forwards our own project's envelopes and answers with Sentry's status", async () => {
    const e = env(vi.fn(async () => 429))
    const body = envelope(DSN)
    expect(await handleTunnel(body, e)).toBe(429)
    expect(e.send).toHaveBeenCalledExactlyOnceWith(
      'https://o123.ingest.us.sentry.io/api/456/envelope/',
      body,
    )
  })

  it('refuses envelopes for any other project, key or host', async () => {
    for (const dsn of [
      'https://pubkey@o123.ingest.us.sentry.io/999',
      'https://otherkey@o123.ingest.us.sentry.io/456',
      'https://pubkey@evil.example.com/456',
      'not a url',
      undefined,
    ]) {
      const e = env()
      expect(await handleTunnel(envelope(dsn), e)).toBe(400)
      expect(e.send).not.toHaveBeenCalled()
    }
    expect(await handleTunnel(enc('garbage'), env())).toBe(400)
  })

  it('is off without a DSN, and refuses oversized bodies', async () => {
    expect(await handleTunnel(envelope(DSN), env(undefined, null))).toBe(404)
    const e = env()
    expect(await handleTunnel(new Uint8Array(MAX_ENVELOPE_BYTES + 1), e)).toBe(413)
    expect(e.send).not.toHaveBeenCalled()
  })

  it('answers 502 when Sentry is unreachable', async () => {
    const e = env(vi.fn(async () => Promise.reject(new Error('offline'))))
    expect(await handleTunnel(envelope(DSN), e)).toBe(502)
  })
})
