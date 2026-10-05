// What leaves the app in an error report (ARCHITECTURE §5.3, A28): the stack, the route and ids.
// No emails, request bodies, cookies, headers or query strings, and no breadcrumbs that could carry
// what someone typed or tapped (item titles, poll questions, names live in button labels).

import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

const EMAIL = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi

export const redactEmails = (s: string): string => s.replace(EMAIL, '[email]')

/** A URL without its query string or fragment (ids in the path stay; filters and tokens don't). */
export const withoutQuery = (url: string): string => url.replace(/[?#].*$/s, '')

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Navigation and network breadcrumbs only, reduced to their path, method and status. */
export const scrubBreadcrumb = (b: Breadcrumb): Breadcrumb | null => {
  const data = b.data ?? {}
  if (b.category === 'navigation') {
    const from = str(data.from)
    const to = str(data.to)
    return {
      ...b,
      message: undefined,
      data: { from: from && withoutQuery(from), to: to && withoutQuery(to) },
    }
  }
  if (b.category === 'fetch' || b.category === 'xhr') {
    const url = str(data.url)
    return {
      ...b,
      message: undefined,
      data: { method: data.method, url: url && withoutQuery(url), status_code: data.status_code },
    }
  }
  return null
}

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  const { request } = event
  return {
    ...event,
    user: undefined,
    extra: undefined,
    message: event.message && redactEmails(event.message),
    request: request && {
      method: request.method,
      url: request.url && withoutQuery(request.url),
    },
    exception: event.exception && {
      ...event.exception,
      values: event.exception.values?.map((v) => ({
        ...v,
        value: v.value && redactEmails(v.value),
      })),
    },
    breadcrumbs: event.breadcrumbs?.flatMap((b) => scrubBreadcrumb(b) ?? []),
  }
}
