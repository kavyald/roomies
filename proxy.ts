// Runs before every page request (Next 16's Proxy, formerly Middleware): refreshes the Supabase
// session cookie, and sends signed-out visitors away from house pages. The pages still check the
// session themselves, and RLS guards the data either way.

import { NextResponse, type NextRequest } from 'next/server'
import { sessionClient } from './lib/adapters/supabase/server'
import { publicConfig } from './lib/config'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { supabaseUrl, supabaseAnonKey } = publicConfig()
  const sb = sessionClient(supabaseUrl, supabaseAnonKey, {
    getAll: () => request.cookies.getAll(),
    setAll: (list) => {
      list.forEach(({ name, value }) => request.cookies.set(name, value))
      response = NextResponse.next({ request })
      list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    },
  })
  const { data } = await sb.auth.getUser()

  if (!data.user && request.nextUrl.pathname.startsWith('/h/')) {
    const to = request.nextUrl.clone()
    to.pathname = '/sign-in'
    to.search = ''
    return NextResponse.redirect(to)
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|offline).*)',
  ],
}
