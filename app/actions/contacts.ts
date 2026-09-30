'use server'

import { houseEnv } from './env'
import { makeCreateContact } from '@/lib/app/contacts'
import type { HouseId } from '@/lib/domain/ids'
import { newContactSchema } from '@/lib/schemas/contacts'
import { makeAction } from '@/lib/server/action'

export async function createContactAction(houseId: HouseId, input: unknown) {
  return makeAction(
    newContactSchema,
    (deps, actor, i) => makeCreateContact(deps)(actor, i),
    houseEnv(houseId),
  )(input)
}
