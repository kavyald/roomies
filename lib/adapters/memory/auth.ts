import type { AuthGateway, IdGenerator } from '../../app/ports'
import type { UserId } from '../../domain/ids'
import { err, ok } from '../../domain/result'
import type { MemoryUnitOfWork } from './db'

export type MemoryAuth = AuthGateway & {
  /** Emails that were actually sent a code, in order. */
  readonly sentCodes: string[]
}

export const memoryAuth = (uow: MemoryUnitOfWork, ids: IdGenerator): MemoryAuth => {
  const sentCodes: string[] = []
  const findUser = (email: string) =>
    [...uow.state.users].find(([, u]) => u.email === email.toLowerCase())?.[0]

  return {
    sentCodes,
    createUser: async (email) => {
      if (findUser(email)) return err('already_exists')
      const id = ids.newId<'user'>() as UserId
      uow.addUser(id, email.toLowerCase())
      return ok(id)
    },
    sendCode: async (email) => {
      if (findUser(email)) sentCodes.push(email.toLowerCase())
    },
    deleteUser: async (id) => {
      uow.state.users.delete(id)
    },
  }
}
