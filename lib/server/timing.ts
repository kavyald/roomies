// Server-Timing (T115): how long each part of answering a page took, in a form browsers show in
// DevTools and `pnpm perf` reads. The proxy's parts go in the `Server-Timing` header; the house
// layout's go in a <meta name="roomies-server-timing"> in the same format, since a server
// component can't set response headers.

export type Timing = { readonly name: string; readonly ms: number; readonly desc?: string }

/** `session;dur=1.2;desc="Session cookie", auth;dur=14.0` */
export const serverTiming = (timings: readonly Timing[]): string =>
  timings
    .map(({ name, ms, desc }) => {
      const dur = `${name};dur=${Math.max(0, ms).toFixed(1)}`
      return desc ? `${dur};desc="${desc.replace(/["\\]/g, '')}"` : dur
    })
    .join(', ')

export const SERVER_TIMING_META = 'roomies-server-timing'

/** Times `work` and returns its result with how long it took. */
export const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now()
  const value = await work()
  return [value, performance.now() - start]
}
