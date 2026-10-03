// The /api/cron/<job> entry point (ARCHITECTURE §7.3): pg_cron calls it with the shared secret in
// `x-cron-secret`; the named job runs as the system actor and reports what it did.

import { timingSafeEqual } from 'node:crypto'

export type CronJob = () => Promise<Record<string, unknown>>

export type CronResponse = { readonly status: number; readonly body: Record<string, unknown> }

/** Constant-time comparison, so the secret can't be guessed a character at a time. */
const sameSecret = (given: string | null, expected: string): boolean => {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const handleCron = async (
  job: string,
  secret: string | null,
  env: {
    readonly cronSecret: string
    readonly jobs: Readonly<Record<string, CronJob>>
    readonly now: () => number
    readonly log: (line: string) => void
  },
): Promise<CronResponse> => {
  if (!sameSecret(secret, env.cronSecret)) return { status: 401, body: { error: 'unauthorized' } }
  const run = Object.hasOwn(env.jobs, job) ? env.jobs[job] : undefined
  if (!run) return { status: 404, body: { error: 'unknown_job' } }
  const started = env.now()
  try {
    const result = await run()
    env.log(`[cron] ${job} ok in ${Math.round(env.now() - started)}ms ${JSON.stringify(result)}`)
    return { status: 200, body: { job, ok: true, ...result } }
  } catch (e) {
    env.log(`[cron] ${job} error: ${e instanceof Error ? e.message : String(e)}`)
    return { status: 500, body: { job, ok: false } }
  }
}
