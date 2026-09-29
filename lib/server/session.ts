// Who is acting in a request. T13 reads the Supabase session from cookies; until then nobody is
// signed in, so commands answer 'not_signed_in'.

import type { Actor } from '../domain/actor'
import type { HouseId } from '../domain/ids'

export const currentActor = async (_houseId: HouseId): Promise<Actor | null> => null
