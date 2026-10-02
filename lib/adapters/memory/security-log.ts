import type { SecurityLog } from '../../app/ports'
import type { SecurityEvent } from '../../domain/security'

export const memorySecurityLog = (): SecurityLog & { readonly events: SecurityEvent[] } => {
  const events: SecurityEvent[] = []
  return {
    events,
    record: async (event) => {
      events.push(event)
    },
  }
}
