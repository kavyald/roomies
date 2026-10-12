// A PushSender for tests: records what was sent; endpoints listed as gone answer 410.
import type { PushSender } from '../../app/ports'
import type { PushOutcome, PushSubscription } from '../../domain/push'

export type FakePush = PushSender & {
  readonly sent: { endpoint: string; payload: unknown }[]
  /** Endpoints the "push service" reports as gone (410), failing (500) or refusing (403). */
  readonly gone: Set<string>
  readonly failing: Set<string>
  readonly rejecting: Set<string>
}

export const fakePush = (): FakePush => {
  const sent: FakePush['sent'] = []
  const gone = new Set<string>()
  const failing = new Set<string>()
  const rejecting = new Set<string>()
  return {
    sent,
    gone,
    failing,
    rejecting,
    send: async (sub: PushSubscription, payload: string): Promise<PushOutcome> => {
      if (gone.has(sub.endpoint)) return { kind: 'gone' }
      if (failing.has(sub.endpoint)) return { kind: 'failed' }
      if (rejecting.has(sub.endpoint)) return { kind: 'rejected' }
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
      return { kind: 'sent' }
    },
  }
}
