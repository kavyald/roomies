import { beforeEach, describe, expect, it, vi } from 'vitest'

const flushed = Promise.resolve(true)
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  flush: vi.fn(),
}))
const vercel = vi.hoisted(() => ({ waitUntil: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)
vi.mock('@vercel/functions', () => vercel)

const { captureRequestError, reportError } = await import('./server')

describe('server reports are flushed before Vercel freezes the function (T79)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentry.flush.mockReturnValue(flushed)
  })

  it('reportError captures, then hands a flush to waitUntil', () => {
    const e = new Error('boom')
    reportError(e, 'action')
    expect(sentry.captureException).toHaveBeenCalledWith(e, { tags: { where: 'action' } })
    expect(sentry.flush).toHaveBeenCalledWith(2000)
    expect(vercel.waitUntil).toHaveBeenCalledWith(flushed)
  })

  it("Next's onRequestError captures, then hands a flush to waitUntil", () => {
    const e = new Error('render')
    const request = { path: '/h/h1', method: 'GET', headers: {} }
    const context = {
      routerKind: 'App Router',
      routePath: '/h/[houseId]',
      routeType: 'render',
    } as const
    captureRequestError(e, request, context)
    expect(sentry.captureRequestError).toHaveBeenCalledWith(e, request, context)
    expect(vercel.waitUntil).toHaveBeenCalledWith(flushed)
    const [captured] = sentry.captureRequestError.mock.invocationCallOrder
    const [waited] = vercel.waitUntil.mock.invocationCallOrder
    expect(captured).toBeLessThan(waited ?? 0)
  })
})
