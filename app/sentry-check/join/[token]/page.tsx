// THROWAWAY (E2 Sentry check, never merged): a render error under a /join/<token> path, so the
// report's contexts.nextjs.request_path carries a token and query for the scrubber to remove.
export const dynamic = 'force-dynamic'

export default async function JoinCheck() {
  throw new Error('Sentry check (render under /join/<token>)')
}
