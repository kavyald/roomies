// The browser's Sentry reports arrive at /monitoring on this origin (A28) and go on to Sentry from
// here, so the page CSP names no Sentry host and ad blockers don't drop them. Only envelopes for our
// own DSN are forwarded: anything else is refused, so the route can't relay to someone else's project.

export type TunnelEnv = {
  /** The configured DSN, or null when error reporting is off. */
  readonly dsn: string | null
  /** POSTs the envelope and returns Sentry's status. */
  readonly send: (url: string, body: Uint8Array<ArrayBuffer>) => Promise<number>
}

/** Envelopes are small (one event); anything bigger isn't from our SDK. */
export const MAX_ENVELOPE_BYTES = 512 * 1024

type Dsn = {
  readonly key: string
  readonly host: string
  readonly project: string
  readonly protocol: string
}

const parseDsn = (dsn: unknown): Dsn | null => {
  if (typeof dsn !== 'string') return null
  try {
    const u = new URL(dsn)
    const project = u.pathname.split('/').filter(Boolean).at(-1)
    if (!u.username || !project) return null
    return { key: u.username, host: u.host, project, protocol: u.protocol }
  } catch {
    return null
  }
}

/** Sentry's envelope endpoint for a DSN: https://<host>/api/<project>/envelope/ */
export const envelopeUrl = (dsn: string): string | null => {
  const d = parseDsn(dsn)
  return d && `${d.protocol}//${d.host}/api/${d.project}/envelope/`
}

/** The DSN named in an envelope's first line (its JSON header). */
const envelopeDsn = (body: Uint8Array<ArrayBuffer>): unknown => {
  const end = body.indexOf(10)
  try {
    return JSON.parse(new TextDecoder().decode(end === -1 ? body : body.subarray(0, end))).dsn
  } catch {
    return undefined
  }
}

const sameProject = (a: Dsn, b: Dsn): boolean =>
  a.key === b.key && a.host === b.host && a.project === b.project

/** The status to answer the browser with. */
export const handleTunnel = async (
  body: Uint8Array<ArrayBuffer>,
  env: TunnelEnv,
): Promise<number> => {
  const ours = env.dsn ? parseDsn(env.dsn) : null
  const url = env.dsn && envelopeUrl(env.dsn)
  if (!ours || !url) return 404
  if (body.byteLength > MAX_ENVELOPE_BYTES) return 413
  const theirs = parseDsn(envelopeDsn(body))
  if (!theirs || !sameProject(ours, theirs)) return 400
  try {
    return await env.send(url, body)
  } catch {
    return 502
  }
}
