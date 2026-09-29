import { AccessDenied, type AppDeps } from './ports'
import type { Actor } from '../domain/actor'
import type { House } from '../domain/house'
import { asId, type HouseId, type UserId } from '../domain/ids'
import { err, ok, type Result } from '../domain/result'
import { safeEqual, setupHouse, type NewHouse, type SetupError } from '../domain/setup'

export type SetupStatus = 'available' | 'already_set_up' | 'invalid_token'

/** Roomies checking setup before anyone is signed in; it touches no house. */
const NO_HOUSE: Actor = {
  kind: 'system',
  houseId: asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId,
}

/** Whether this setup link still works: the right token, and no house yet. */
export const makeSetupStatus =
  ({ uow, config }: Pick<AppDeps, 'uow' | 'config'>) =>
  async (token: string): Promise<SetupStatus> => {
    if (!safeEqual(token, config.setupToken)) return 'invalid_token'
    const available = await uow.run(NO_HOUSE, (r) => r.houses.setupAvailable())
    return available ? 'available' : 'already_set_up'
  }

/** The owner creates the one house (ARCHITECTURE §5.2). Works once; afterwards it's refused. */
export const makeSetupHouse =
  ({ uow, clock, ids, config }: Pick<AppDeps, 'uow' | 'clock' | 'ids' | 'config'>) =>
  async (
    owner: UserId,
    token: string,
    input: NewHouse,
  ): Promise<Result<House, SetupError | 'invalid_token' | 'already_set_up'>> => {
    if (!safeEqual(token, config.setupToken)) return err('invalid_token')
    try {
      return await uow.run({ kind: 'user', userId: owner }, async (repos) => {
        if (!(await repos.houses.setupAvailable())) return err('already_set_up')
        const now = clock.now()
        const existing = await repos.profiles.get(owner)
        const r = setupHouse(input, owner, now, () => ids.newId(), existing)
        if (!r.ok) return r
        const { house, profile, member, rooms, events } = r.value
        await repos.profiles.save(profile)
        await repos.houses.save(house)
        await repos.members.save(member)
        for (const room of rooms) await repos.rooms.save(room)
        await repos.events.record(house.id, events, now)
        return ok(house)
      })
    } catch (e) {
      // Two setups at once: the database lets only the first house in.
      if (e instanceof AccessDenied) return err('already_set_up')
      throw e
    }
  }
