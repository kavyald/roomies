'use server'

import { makeCreateContact } from '@/lib/app/contacts'
import { depsForRequest } from '@/lib/compose'
import type { HouseId } from '@/lib/domain/ids'
import { newContactSchema } from '@/lib/schemas/contacts'
import { makeAction } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

export async function createContactAction(houseId: HouseId, input: unknown) {
  return makeAction(newContactSchema, (deps, actor, i) => makeCreateContact(deps)(actor, i), {
    currentActor: () => currentActor(houseId),
    deps: (actor) => depsForRequest({ actor }),
  })(input)
}
