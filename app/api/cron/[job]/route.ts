// pg_cron → pg_net → here (T32). Each job is a use case run with depsForJob() (the system actor).
import { makeSendNotifications } from '@/lib/app/push'
import { depsForJob } from '@/lib/compose'
import { serverConfig } from '@/lib/config'
import { handleCron, type CronJob } from '@/lib/server/cron'

export const dynamic = 'force-dynamic'

/** The scheduled jobs. `tick` is the heartbeat that proves the schedule reaches the app. */
const jobs = (): Record<string, CronJob> => ({
  tick: async () => ({}),
  'send-notifications': async () => {
    const r = await makeSendNotifications(depsForJob())()
    return r.value
  },
})

export async function POST(request: Request, ctx: RouteContext<'/api/cron/[job]'>) {
  const { job } = await ctx.params
  const r = await handleCron(job, request.headers.get('x-cron-secret'), {
    cronSecret: serverConfig().cronSecret,
    jobs: jobs(),
    now: () => performance.now(),
    log: (line) => console.log(line),
  })
  return Response.json(r.body, { status: r.status })
}
