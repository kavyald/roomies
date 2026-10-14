import { securityLogContract } from '../contracts/security-log.contract'
import { memorySecurityLog } from './security-log'

securityLogContract('memory', () => {
  const log = memorySecurityLog()
  return { log, read: async (ip) => log.events.filter((e) => e.ip === ip) }
})
