'use server'
// THROWAWAY (E2 Sentry check, never merged): errors thrown on purpose through the real paths.
import { z } from 'zod'
import type { AppDeps } from '@/lib/app/ports'
import { logUnexpected } from '@/lib/compose'
import { asId } from '@/lib/domain/ids'
import { makeAction } from '@/lib/server/action'

// Bait: the scrubber should turn the email into [email] and the token path into /join/[token].
const bait = (where: string) =>
  new Error(`Sentry check (${where}): bait e2-bait@example.com /join/e2-bait-token`)

/** An action's 'unexpected' (makeAction → logUnexpected → reportError). */
export async function caughtActionError() {
  return makeAction(
    z.object({}),
    async () => {
      throw bait('server action, caught')
    },
    {
      currentActor: async () => ({
        kind: 'member',
        userId: asId('00000000-0000-0000-0000-0000000000e2'),
        houseId: asId('00000000-0000-0000-0000-0000000000e2'),
      }),
      deps: () => ({}) as AppDeps,
      log: logUnexpected('action'),
    },
  )({})
}

/** An error Next catches itself (onRequestError → captureRequestError). */
export async function uncaughtActionError(): Promise<never> {
  throw bait('server action, uncaught')
}
