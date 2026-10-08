import type { IdGenerator } from '../../app/ports'
import { asId } from '../../domain/ids'

export const cryptoIds: IdGenerator = { newId: () => asId(globalThis.crypto.randomUUID()) }

/**
 * Predictable ids for tests: 00000000-0000-4000-8000-000000000001, …002, …
 * They're valid v4-shaped UUIDs, so the Postgres adapter accepts them too. `prefix` (up to 8 hex
 * digits) keeps runs from colliding in a shared database.
 */
export type SeqIds = IdGenerator & { readonly count: () => number }

export const seqIds = (prefix = '00000000'): SeqIds => {
  let n = 0
  return {
    newId: () =>
      asId(`${prefix.padStart(8, '0')}-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`),
    count: () => n,
  }
}
