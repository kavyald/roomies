// A PushSender for tests: records what was sent; endpoints listed as gone answer 410.
import type { PushSender } from '../../app/ports'
import type { PushOutcome, PushSubscription } from '../../domain/push'

export type FakePush = PushSender & {
  readonly sent: { endpoint: string; payload: unknown }[]
  /** Endpoints the "push service" reports as gone (410) or failing (500). */
  readonly gone: Set<string>
  readonly failing: Set<string>
}

export const fakePush = (): FakePush => {
  const sent: FakePush['sent'] = []
  const gone = new Set<string>()
  const failing = new Set<string>()
  return {
    sent,
    gone,
    failing,
    send: async (sub: PushSubscription, payload: string): Promise<PushOutcome> => {
      if (gone.has(sub.endpoint)) return 'gone'
      if (failing.has(sub.endpoint)) return 'failed'
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
      return 'sent'
    },
  }
}
