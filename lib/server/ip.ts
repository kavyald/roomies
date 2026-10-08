import { headers } from 'next/headers'

/** The caller's IP for rate limits: the first X-Forwarded-For hop (Vercel sets it), else unknown. */
export const requestIp = async (): Promise<string> => {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}
