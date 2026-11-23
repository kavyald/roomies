// Runs before every page request (Next 16's Proxy, formerly Middleware): sets the page's
// Content-Security-Policy with a fresh nonce, refreshes the Supabase session cookie, and sends
// signed-out visitors away from house pages.
//
// Its look at the session is optimistic (T115, ARCHITECTURE §5.4): it reads the cookie and asks
// Supabase Auth only to refresh a token that has run out, so it's never trusted with who someone
// is. The verified check (`getUser`, a call to Supabase Auth) is the page's or the server action's
// own (lib/server/session), and RLS guards the data either way. A cookie that only looks signed
// in gets as far as that check, which sends it to sign-in.

import { NextResponse, type NextRequest } from 'next/server'
import { sessionClient } from './lib/adapters/supabase/server'
import { devToolsEnabled, publicConfig } from './lib/config'
import { contentSecurityPolicy } from './lib/server/csp'
import { serverTiming, timed } from './lib/server/timing'

export async function proxy(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = publicConfig()
  const csp = contentSecurityPolicy({
    nonce: btoa(crypto.randomUUID()),
    supabaseUrl,
    dev: devToolsEnabled(),
    https: request.nextUrl.protocol === 'https:',
  })
  // Next reads the nonce from the request's CSP header and puts it on its own scripts (this is
  // why every page renders dynamically: see app/layout.tsx).
  request.headers.set('content-security-policy', csp)
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  let response = NextResponse.next({ request })
  // The service worker caches /offline at install; it needs no session.
  if (request.nextUrl.pathname === '/offline') return withCsp(response)

  const sb = sessionClient(supabaseUrl, supabaseAnonKey, {
    getAll: () => request.cookies.getAll(),
    setAll: (list) => {
      list.forEach(({ name, value }) => request.cookies.set(name, value))
      response = NextResponse.next({ request })
      list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    },
  })
  // Only whether there's a session, never its user: getSession doesn't verify it.
  const [{ data }, ms] = await timed(() => sb.auth.getSession())
  const timing = (res: NextResponse) => {
    res.headers.set(
      'Server-Timing',
      serverTiming([{ name: 'session', ms, desc: 'Proxy: session' }]),
    )
    return res
  }

  if (!data.session && request.nextUrl.pathname.startsWith('/h/')) {
    const to = request.nextUrl.clone()
    to.pathname = '/sign-in'
    to.search = ''
    return timing(withCsp(NextResponse.redirect(to)))
  }
  return timing(withCsp(response))
}

// /monitoring is the Sentry tunnel (app/monitoring/route.ts): no page, no session.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|icons/|monitoring|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)',
  ],
}
