// The page Content-Security-Policy (ARCHITECTURE §5.4). proxy.ts builds one per request with a
// fresh nonce; Next reads the nonce back from the request header and puts it on its own scripts.

export type CspInput = {
  /** Base64, fresh for every request. */
  readonly nonce: string
  /** Where the browser's Supabase client talks to: REST over http(s), Realtime over ws(s). */
  readonly supabaseUrl: string
  /** `next dev`: React needs eval for its debugging stacks. */
  readonly dev: boolean
  /** Served over https: upgrade any stray http subresource. Off locally (http://localhost). */
  readonly https: boolean
}

/** The Supabase origin and its websocket twin, e.g. https://x.supabase.co + wss://x.supabase.co. */
export const supabaseOrigins = (supabaseUrl: string): [string, string] => {
  const origin = new URL(supabaseUrl).origin
  return [origin, origin.replace(/^http/, 'ws')]
}

export const contentSecurityPolicy = ({ nonce, supabaseUrl, dev, https }: CspInput): string => {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // 'strict-dynamic': scripts the nonced Next runtime loads (its chunks) are trusted too.
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Vaul and Radix add <style> tags at runtime without a nonce, and React renders style=""
    // attributes; a nonce here would switch 'unsafe-inline' off, so styles stay unnonced.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...supabaseOrigins(supabaseUrl)],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
    ['object-src', "'none'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ...(https ? [['upgrade-insecure-requests'] as [string]] : []),
  ]
  return directives.map((d) => d.join(' ')).join('; ')
}
