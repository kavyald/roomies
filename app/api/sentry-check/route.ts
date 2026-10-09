// THROWAWAY (E2 Sentry check, never merged): a failed cron job through handleCron → reportCaught.
import { reportCaught } from '@/lib/compose'
import { serverConfig } from '@/lib/config'
import { handleCron } from '@/lib/server/cron'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { cronSecret } = serverConfig()
  const r = await handleCron('sentry-check', cronSecret, {
    cronSecret,
    jobs: {
      'sentry-check': async () => {
        throw new Error('Sentry check (cron): bait e2-bait@example.com /setup/e2-bait-token')
      },
    },
    now: () => performance.now(),
    log: (line) => console.log(line),
    report: reportCaught('cron:sentry-check'),
  })
  return Response.json(r.body, { status: r.status })
}
