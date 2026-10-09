// What leaves the app in an error report (ARCHITECTURE §5.3, A28): the stack, the route and ids.
// No emails, request bodies, cookies, headers or query strings, no setup or invite tokens (they sit
// in the path: /setup/<token>, /join/<token>), and no breadcrumbs that could carry what someone typed
// or tapped (item titles, poll questions, names live in button labels).

import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

const EMAIL = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi

const TOKEN_PATH = /\/(setup|join)\/[^/?#\s"'<>]+/g

export const redactEmails = (s: string): string => s.replace(EMAIL, '[email]')

/** /setup/<token> and /join/<token> become /setup/[token] and /join/[token]. */
export const redactTokens = (s: string): string => s.replace(TOKEN_PATH, '/$1/[token]')

const redact = (s: string): string => redactTokens(redactEmails(s))

/** A URL without its query string, fragment or path token (ids in the path stay). */
export const withoutQuery = (url: string): string => redactTokens(url.replace(/[?#].*$/s, ''))

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

type Contexts = NonNullable<ErrorEvent['contexts']>

/** Strings in contexts lose emails and tokens; nextjs.request_path (onRequestError's raw path) also its query. */
const scrubContexts = (contexts: Contexts): Contexts =>
  Object.fromEntries(
    Object.entries(contexts).map(([name, context]) => [
      name,
      context &&
        Object.fromEntries(
          Object.entries(context).map(([key, v]) => [
            key,
            typeof v !== 'string'
              ? v
              : name === 'nextjs' && key === 'request_path'
                ? withoutQuery(v)
                : redact(v),
          ]),
        ),
    ]),
  )

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  const { request } = event
  return {
    ...event,
    user: undefined,
    extra: undefined,
    contexts: event.contexts && scrubContexts(event.contexts),
    message: event.message && redact(event.message),
    transaction: event.transaction && withoutQuery(event.transaction),
    request: request && {
      method: request.method,
      url: request.url && withoutQuery(request.url),
    },
    exception: event.exception && {
      ...event.exception,
      values: event.exception.values?.map((v) => ({
        ...v,
        value: v.value && redact(v.value),
      })),
    },
    breadcrumbs: event.breadcrumbs?.flatMap((b) => scrubBreadcrumb(b) ?? []),
  }
}
