import type { UserId } from '../domain/ids'
import type { HouseId } from '../domain/ids'
import type { AppDeps } from './ports'

export type Destination =
  | { readonly to: 'house'; readonly houseId: HouseId }
  | { readonly to: 'moved_out' }
  | { readonly to: 'no_house' }

/** Where a signed-in person lands: their house, or a note if they have none (ARCHITECTURE §5.2). */
export const makeWhereTo =
  ({ uow }: Pick<AppDeps, 'uow'>) =>
  (userId: UserId): Promise<Destination> =>
    uow.run({ kind: 'user', userId }, async (repos) => {
      const memberships = await repos.members.listForUser(userId)
      const active = memberships.find((m) => m.status.active)
      if (active) return { to: 'house', houseId: active.houseId }
      return memberships.length > 0 ? { to: 'moved_out' } : { to: 'no_house' }
    })
