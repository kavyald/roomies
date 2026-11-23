// The proxy's look at the session is optimistic (T115, ARCHITECTURE §5.4): it reads the cookie,
// never asks Supabase Auth who someone is, and leaves the verified check to the page.
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
}))
vi.mock('./lib/adapters/supabase/server', () => ({
  sessionClient: () => ({ auth }),
}))
vi.mock('./lib/config', () => ({
  publicConfig: () => ({
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseAnonKey: 'anon',
    vapidPublicKey: 'vapid',
  }),
  devToolsEnabled: () => false,
}))

const { proxy } = await import('./proxy')

const signedIn = { data: { session: { access_token: 'jwt' } }, error: null }
const signedOut = { data: { session: null }, error: null }
const get = (path: string) => new NextRequest(new URL(path, 'https://roomies.test'))

beforeEach(() => {
  auth.getSession.mockReset()
  auth.getUser.mockReset()
})

describe('the proxy (T115)', () => {
  it('lets a house page through on the session cookie, without asking Supabase Auth who it is', async () => {
    auth.getSession.mockResolvedValue(signedIn)
    const res = await proxy(get('/h/some-house/needs'))
    expect(res.headers.get('location')).toBeNull()
    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it('sends a visitor with no session from a house page to sign-in', async () => {
    auth.getSession.mockResolvedValue(signedOut)
    const res = await proxy(get('/h/some-house/needs?x=1'))
    expect(res.headers.get('location')).toBe('https://roomies.test/sign-in')
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it('leaves pages outside the house alone for someone signed out', async () => {
    auth.getSession.mockResolvedValue(signedOut)
    const res = await proxy(get('/sign-in'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('says how long its session check took, and still sets the page CSP', async () => {
    auth.getSession.mockResolvedValue(signedIn)
    const res = await proxy(get('/h/some-house'))
    expect(res.headers.get('server-timing')).toMatch(/^session;dur=\d+\.\d;desc="Proxy: session"$/)
    expect(res.headers.get('content-security-policy')).toMatch(/'nonce-[^']+'/)
  })
})
