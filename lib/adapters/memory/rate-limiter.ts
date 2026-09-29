import type { RateLimiter } from '../../app/ports'

export const memoryRateLimiter = (): RateLimiter & { readonly counts: Map<string, number> } => {
  const counts = new Map<string, number>()
  return {
    counts,
    hit: async (key, { limit, windowMs }, now) => {
      const k = `${key}@${Math.floor(now.epochMs / windowMs)}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return n <= limit
    },
  }
}
