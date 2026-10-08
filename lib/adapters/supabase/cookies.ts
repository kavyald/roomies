// Shared by the server and browser Supabase clients (no Supabase import, so the browser bundle
// stays small).

/**
 * The auth cookies' options, pinned rather than left to @supabase/ssr's defaults (the same
 * today): SameSite=Lax, path /. The browser client reads them, so they aren't HttpOnly
 * (ARCHITECTURE §5.4).
 */
export const AUTH_COOKIE_OPTIONS = { sameSite: 'lax', path: '/' } as const
