import { createHash, randomBytes } from 'node:crypto'
import type { Tokens } from '../../app/ports'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export const cryptoTokens: Tokens = {
  newToken: () => randomBytes(16).toString('base64url'),
  hash: sha256,
}

/** Predictable tokens for tests ("tok-1", "tok-2", …), hashed the same way as real ones. */
export const seqTokens = (): Tokens & { readonly issued: string[] } => {
  const issued: string[] = []
  return {
    issued,
    newToken: () => {
      const t = `tok-${issued.length + 1}`
      issued.push(t)
      return t
    },
    hash: sha256,
  }
}
