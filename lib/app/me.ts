// Personal settings use cases (T36): your own theme, quiet hours, and which notifications you get.
// RLS lets you change only your own profile and toggles; changing quiet hours re-times your waiting
// messages (T83).

import type { AppDeps } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { Profile } from '../domain/house'
import { DEFAULT_QUIET_HOURS, retimed, type NotificationCategory } from '../domain/notifications'
import { updateSettings, type SettingsPatch } from '../domain/profile'
import { err, ok } from '../domain/result'

export const makeUpdateMySettings =
  ({ uow, clock }: Pick<AppDeps, 'uow' | 'clock'>) =>
  async (actor: HouseActor, patch: SettingsPatch) => {
    const saved = await uow.run(actor, async (repos) => {
      const me = actorUser(actor)
      const profile = me && (await repos.profiles.get(me))
      if (!profile) return err('not_found')
      const r = updateSettings(profile, patch)
      if (!r.ok) return r
      await repos.profiles.save(r.value)
      return ok(r.value)
    })
    if (saved.ok && patch.quietHours !== undefined) await retimeHeld(uow, clock, actor, saved.value)
    return saved
  }

/**
 * Messages already waiting for their old quiet hours follow the new ones (T83, owner 2026-11-10).
 * Sending is the system's job, so this runs as the system, only over their own messages.
 */
const retimeHeld = async (
  uow: AppDeps['uow'],
  clock: AppDeps['clock'],
  actor: HouseActor,
  profile: Profile,
) => {
  const now = clock.now()
  const quiet = profile.quietHours ?? DEFAULT_QUIET_HOURS
  await uow.run({ kind: 'system', houseId: actor.houseId }, async (repos) => {
    const held = await repos.notifications.heldFor(profile.id, now)
    const zones = new Map<string, string | undefined>()
    for (const m of held) {
      if (!zones.has(m.houseId))
        zones.set(m.houseId, (await repos.houses.get(m.houseId))?.settings.timezone)
      const tz = profile.timezone ?? zones.get(m.houseId)
      const at = tz && retimed(m, now, tz, quiet)
      if (at) await repos.notifications.reschedule(m.id, at)
    }
    return ok(held.length)
  })
}

/** Turning a category off means those messages aren't enqueued for you at all. */
export const makeSetNotificationEnabled =
  ({ uow }: Pick<AppDeps, 'uow'>) =>
  (actor: HouseActor, input: { category: NotificationCategory; enabled: boolean }) =>
    uow.run(actor, async (repos) => {
      const me = actorUser(actor)
      if (!me) return err('not_found')
      await repos.notifications.setEnabled(me, input.category, input.enabled)
      return ok(input)
    })
