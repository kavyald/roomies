import { describe, expect, it } from 'vitest'
import { cryptoTokens, seqTokens } from '.'

describe('tokens', () => {
  it('makes 128-bit URL-safe tokens that differ each time', () => {
    const a = cryptoTokens.newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(cryptoTokens.newToken()).not.toBe(a)
  })

  it('hashes deterministically, and never returns the token itself', () => {
    const t = cryptoTokens.newToken()
    expect(cryptoTokens.hash(t)).toBe(cryptoTokens.hash(t))
    expect(cryptoTokens.hash(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(seqTokens().hash('tok-1')).toBe(cryptoTokens.hash('tok-1'))
  })
})
