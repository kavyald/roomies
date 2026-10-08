// Personal settings use cases (T36): your own theme, quiet hours, and which notifications you get.
// RLS lets you change only your own profile and toggles.

import type { AppDeps } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { NotificationCategory } from '../domain/notifications'
import { updateSettings, type SettingsPatch } from '../domain/profile'
import { err, ok } from '../domain/result'

export const makeUpdateMySettings =
  ({ uow }: Pick<AppDeps, 'uow'>) =>
  (actor: HouseActor, patch: SettingsPatch) =>
    uow.run(actor, async (repos) => {
      const me = actorUser(actor)
      const profile = me && (await repos.profiles.get(me))
      if (!profile) return err('not_found')
      const r = updateSettings(profile, patch)
      if (!r.ok) return r
      await repos.profiles.save(r.value)
      return ok(r.value)
    })

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
