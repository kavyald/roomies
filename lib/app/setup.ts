import { AccessDenied, type AppDeps } from './ports'
import type { Actor } from '../domain/actor'
import type { House } from '../domain/house'
import { asId, type HouseId, type UserId } from '../domain/ids'
import { err, ok, type Result } from '../domain/result'
import type { SecurityStep } from '../domain/security'
import { safeEqual, setupHouse, type NewHouse, type SetupError } from '../domain/setup'
import { SETUP_RATE } from './invites'
import { withinRate, type Attempt } from './security'

export type SetupStatus = 'available' | 'already_set_up' | 'invalid_token'

/** Roomies checking setup before anyone is signed in; it touches no house. */
const NO_HOUSE: Actor = {
  kind: 'system',
  houseId: asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId,
}

type SecurityDeps = Pick<AppDeps, 'clock' | 'config' | 'securityLog'>

/** Whether the setup token is right; a wrong one is logged (§5.4). */
const tokenIsRight = async (
  { clock, config, securityLog }: SecurityDeps,
  token: string,
  ip: string,
  step: SecurityStep,
): Promise<boolean> => {
  if (safeEqual(token, config.setupToken)) return true
  await securityLog.record({ kind: 'setup_token_refused', step, ip, at: clock.now() })
  return false
}

/** Whether this setup link still works: the right token, and no house yet. */
export const makeSetupStatus =
  (deps: Pick<AppDeps, 'uow'> & SecurityDeps) =>
  async (ip: string, token: string): Promise<SetupStatus> => {
    if (!(await tokenIsRight(deps, token, ip, 'setup.view'))) return 'invalid_token'
    const available = await deps.uow.run(NO_HOUSE, (r) => r.houses.setupAvailable())
    return available ? 'available' : 'already_set_up'
  }

/** Setup, step 1: make the owner's account and email them a code. Rate-limited per IP. */
export const makeStartSetup =
  (deps: Pick<AppDeps, 'uow' | 'auth' | 'limiter'> & SecurityDeps) =>
  async (
    ip: string,
    token: string,
    email: string,
  ): Promise<Result<void, Exclude<SetupStatus, 'available'> | 'rate_limited'>> => {
    const at: Attempt = { ip, step: 'setup.start', now: deps.clock.now() }
    if (!(await withinRate(deps, 'setup', SETUP_RATE, at))) return err('rate_limited')
    if (!(await tokenIsRight(deps, token, ip, 'setup.start'))) return err('invalid_token')
    if (!(await deps.uow.run(NO_HOUSE, (r) => r.houses.setupAvailable()))) {
      return err('already_set_up')
    }
    await deps.auth.createUser(email) // already_exists is fine: they may be retrying
    await deps.auth.sendCode(email)
    return ok(undefined)
  }

/** The owner creates the one house (ARCHITECTURE §5.2). Works once; afterwards it's refused. */
export const makeSetupHouse =
  (deps: Pick<AppDeps, 'uow' | 'ids'> & SecurityDeps) =>
  async (
    ip: string,
    owner: UserId,
    token: string,
    input: NewHouse,
  ): Promise<Result<House, SetupError | 'invalid_token' | 'already_set_up'>> => {
    const { uow, clock, ids } = deps
    if (!(await tokenIsRight(deps, token, ip, 'setup.finish'))) return err('invalid_token')
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
