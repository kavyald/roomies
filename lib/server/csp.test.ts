import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, supabaseOrigins } from './csp'

const directives = (csp: string) =>
  new Map(
    csp.split('; ').map((d) => {
      const [name, ...values] = d.split(' ')
      return [name, values] as const
    }),
  )

describe('contentSecurityPolicy', () => {
  const local = {
    nonce: 'abc123==',
    supabaseUrl: 'http://127.0.0.1:54321',
    dev: false,
    https: false,
  }

  it('lets only nonced scripts (and what they load) run', () => {
    const d = directives(contentSecurityPolicy(local))
    expect(d.get('script-src')).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"])
    expect(d.get('default-src')).toEqual(["'self'"])
  })

  it('allows inline styles, local images and the service worker', () => {
    const d = directives(contentSecurityPolicy(local))
    expect(d.get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(d.get('font-src')).toEqual(["'self'"])
    expect(d.get('worker-src')).toEqual(["'self'"])
    expect(d.get('manifest-src')).toEqual(["'self'"])
  })

  it('blocks framing, plugins, <base> and cross-site form posts', () => {
    const d = directives(contentSecurityPolicy(local))
    expect(d.get('frame-ancestors')).toEqual(["'none'"])
    expect(d.get('object-src')).toEqual(["'none'"])
    expect(d.get('base-uri')).toEqual(["'self'"])
    expect(d.get('form-action')).toEqual(["'self'"])
  })

  it('connects to local Supabase over http and ws', () => {
    const d = directives(contentSecurityPolicy(local))
    expect(d.get('connect-src')).toEqual([
      "'self'",
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ])
    expect(d.has('upgrade-insecure-requests')).toBe(false)
  })

  it('connects to hosted Supabase over https and wss, and upgrades http when served over https', () => {
    const d = directives(
      contentSecurityPolicy({ ...local, supabaseUrl: 'https://abc.supabase.co/', https: true }),
    )
    expect(d.get('connect-src')).toEqual([
      "'self'",
      'https://abc.supabase.co',
      'wss://abc.supabase.co',
    ])
    expect(d.get('upgrade-insecure-requests')).toEqual([])
  })

  it("adds 'unsafe-eval' in development only", () => {
    expect(directives(contentSecurityPolicy({ ...local, dev: true })).get('script-src')).toContain(
      "'unsafe-eval'",
    )
    expect(contentSecurityPolicy(local)).not.toContain('unsafe-eval')
  })
})

describe('supabaseOrigins', () => {
  it('drops the path and swaps the scheme for websockets', () => {
    expect(supabaseOrigins('https://abc.supabase.co/rest/v1')).toEqual([
      'https://abc.supabase.co',
      'wss://abc.supabase.co',
    ])
  })
})
