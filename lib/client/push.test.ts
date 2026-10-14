import { afterEach, describe, expect, it, vi } from 'vitest'
import { applicationServerKey, thisBrowsersEndpoint, unsubscribeThisBrowser } from './push'

describe('applicationServerKey', () => {
  it('turns the base64url VAPID key into bytes (padding and URL-safe characters included)', () => {
    // "\xfb\xff" is "-_8" in base64url ("+/8=" in plain base64).
    expect([...applicationServerKey('-_8')]).toEqual([0xfb, 0xff])
    expect([...applicationServerKey('AQID')]).toEqual([1, 2, 3])
  })
})

describe('this browser before signing out (T84)', () => {
  afterEach(() => vi.unstubAllGlobals())

  const withSubscription = (
    sub: { endpoint: string; unsubscribe: () => Promise<boolean> } | null,
  ) =>
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
      },
    })

  it('unsubscribes and hands back the endpoint, so the server forgets it too', async () => {
    const unsubscribe = vi.fn(async () => true)
    withSubscription({ endpoint: 'https://push.example/phone', unsubscribe })
    expect(await thisBrowsersEndpoint()).toBe('https://push.example/phone')
    expect(await unsubscribeThisBrowser()).toBe('https://push.example/phone')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('still hands back the endpoint if unsubscribing fails', async () => {
    withSubscription({
      endpoint: 'https://push.example/phone',
      unsubscribe: async () => {
        throw new Error('nope')
      },
    })
    expect(await unsubscribeThisBrowser()).toBe('https://push.example/phone')
  })

  it('is nothing without a subscription or a service worker', async () => {
    withSubscription(null)
    expect(await unsubscribeThisBrowser()).toBeUndefined()
    vi.stubGlobal('navigator', {})
    expect(await unsubscribeThisBrowser()).toBeUndefined()
    expect(await thisBrowsersEndpoint()).toBeUndefined()
  })
})
