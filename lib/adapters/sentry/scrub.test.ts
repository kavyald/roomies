import type { ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { redactEmails, redactTokens, scrubBreadcrumb, scrubEvent, withoutQuery } from './scrub'

describe('redactEmails', () => {
  it('replaces every address and leaves the rest', () => {
    expect(redactEmails('no user ana.b+x@roomies.test (or bo@example.co.uk)')).toBe(
      'no user [email] (or [email])',
    )
    expect(redactEmails('item 3f2a@v2 not found')).toBe('item 3f2a@v2 not found')
  })
})

describe('redactTokens', () => {
  it('hides setup and invite tokens in paths and leaves other paths alone', () => {
    expect(redactTokens('https://x.app/setup/abc123def?x=1')).toBe(
      'https://x.app/setup/[token]?x=1',
    )
    expect(redactTokens('GET /join/Zx9-tok')).toBe('GET /join/[token]')
    expect(redactTokens('/join/[token]')).toBe('/join/[token]')
    expect(redactTokens('/h/h1/i/i1')).toBe('/h/h1/i/i1')
  })
})

describe('withoutQuery', () => {
  it('keeps the path (ids) and drops the query and fragment', () => {
    expect(withoutQuery('https://x.app/h/h1/i/i1?title=Lemons#top')).toBe('https://x.app/h/h1/i/i1')
    expect(withoutQuery('/rest/v1/items?title=eq.Lemons')).toBe('/rest/v1/items')
    expect(withoutQuery('/h/h1')).toBe('/h/h1')
    expect(withoutQuery('https://x.app/join/tok123?ref=a')).toBe('https://x.app/join/[token]')
  })
})

describe('scrubBreadcrumb', () => {
  it('drops clicks, inputs and console lines, which can carry titles and names', () => {
    for (const category of ['ui.click', 'ui.input', 'console', undefined]) {
      expect(
        scrubBreadcrumb({ category, message: 'button[aria-label="Share a feeling: Lemons"]' }),
      ).toBeNull()
    }
  })

  it('keeps navigation and network crumbs as paths, methods and statuses', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/h/h1?x=1', to: '/h/h1/needs', extra: 'x' },
      }),
    ).toEqual({
      category: 'navigation',
      message: undefined,
      data: { from: '/h/h1', to: '/h/h1/needs' },
    })
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://s.supabase.co/rest/v1/items?title=eq.Lemons',
          status_code: 500,
          request_body: '{"title":"Lemons"}',
        },
      }),
    ).toEqual({
      category: 'fetch',
      message: undefined,
      data: { method: 'GET', url: 'https://s.supabase.co/rest/v1/items', status_code: 500 },
    })
  })
})

describe('scrubEvent', () => {
  const event: ErrorEvent = {
    type: undefined,
    message: 'sign-in for ana@roomies.test failed',
    user: { id: 'u1', email: 'ana@roomies.test', ip_address: '1.2.3.4' },
    extra: { input: { title: 'Lemons' } },
    tags: { where: 'action' },
    request: {
      method: 'POST',
      url: 'https://x.app/h/h1/needs?q=lemons',
      data: '{"title":"Lemons"}',
      cookies: { 'sb-access-token': 'secret' },
      headers: { cookie: 'sb=secret', 'user-agent': 'iPhone' },
      query_string: 'q=lemons',
    },
    exception: {
      values: [{ type: 'Error', value: 'no profile for bo@example.com' }, { type: 'TypeError' }],
    },
    breadcrumbs: [
      { category: 'ui.click', message: 'Lemons' },
      { category: 'navigation', data: { from: '/h/h1', to: '/h/h1/needs' } },
    ],
  }

  it('keeps the stack, the route and tags, and drops everything personal', () => {
    const s = scrubEvent(event)
    expect(s.user).toBeUndefined()
    expect(s.extra).toBeUndefined()
    expect(s.message).toBe('sign-in for [email] failed')
    expect(s.request).toEqual({ method: 'POST', url: 'https://x.app/h/h1/needs' })
    expect(s.exception?.values).toEqual([
      { type: 'Error', value: 'no profile for [email]' },
      { type: 'TypeError', value: undefined },
    ])
    expect(s.breadcrumbs).toEqual([
      { category: 'navigation', message: undefined, data: { from: '/h/h1', to: '/h/h1/needs' } },
    ])
    expect(s.tags).toEqual({ where: 'action' })
    expect(JSON.stringify(s)).not.toMatch(
      /Lemons|lemons|secret|roomies\.test|example\.com|1\.2\.3\.4/,
    )
  })

  it('hides the setup or invite token in the url, transaction, crumbs and messages', () => {
    const s = scrubEvent({
      type: undefined,
      message: 'bad link https://x.app/join/sekrit1',
      transaction: '/setup/sekrit2',
      request: { url: 'https://x.app/setup/sekrit2' },
      exception: { values: [{ type: 'Error', value: 'no invite /join/sekrit1' }] },
      breadcrumbs: [{ category: 'navigation', data: { from: '/', to: '/join/sekrit1' } }],
    })
    expect(JSON.stringify(s)).not.toMatch(/sekrit/)
    expect(s.request?.url).toBe('https://x.app/setup/[token]')
  })

  it("hides the token, query and emails in contexts (onRequestError's nextjs.request_path)", () => {
    const s = scrubEvent({
      type: undefined,
      contexts: {
        nextjs: {
          request_path: '/join/sekrit3?ref=ana@roomies.test',
          router_path: '/join/[token]',
          route_type: 'render',
        },
        culture: { locale: 'en-US', note: 'from /setup/sekrit4 by bo@example.com' },
        app: { app_memory: 1024 },
      },
    })
    expect(s.contexts).toEqual({
      nextjs: { request_path: '/join/[token]', router_path: '/join/[token]', route_type: 'render' },
      culture: { locale: 'en-US', note: 'from /setup/[token] by [email]' },
      app: { app_memory: 1024 },
    })
    expect(JSON.stringify(s)).not.toMatch(/sekrit|roomies\.test|example\.com/)
  })

  it('leaves an event without a request or exception alone', () => {
    expect(scrubEvent({ type: undefined, message: 'tick' })).toMatchObject({
      message: 'tick',
      request: undefined,
      exception: undefined,
      breadcrumbs: undefined,
    })
  })
})
