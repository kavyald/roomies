// The Sentry tunnel (A28): the browser posts its error reports here; lib/server/error-tunnel checks
// they're for our project and forwards them.
import { errorReportingConfig } from '@/lib/config'
import { handleTunnel } from '@/lib/server/error-tunnel'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const status = await handleTunnel(new Uint8Array(await request.arrayBuffer()), {
    dsn: errorReportingConfig()?.dsn ?? null,
    send: async (url, body) =>
      (
        await fetch(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
        })
      ).status,
  })
  return new Response(null, { status })
}
