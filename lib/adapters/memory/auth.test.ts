import { authGatewayContract } from '../contracts/auth-gateway.contract'
import { seqIds } from '../ids'
import { memoryAuth } from './auth'
import { MemoryUnitOfWork } from './db'

let n = 0
authGatewayContract('memory', async () => {
  const auth = memoryAuth(new MemoryUnitOfWork(), seqIds())
  return {
    auth,
    codesSentTo: async (email) => auth.sentCodes.filter((e) => e === email.toLowerCase()).length,
    freshEmail: () => `person${++n}@example.test`,
  }
})
