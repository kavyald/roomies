'use server'

import { houseEnv } from './env'
import { makeSetNotificationEnabled, makeUpdateMySettings } from '@/lib/app/me'
import type { HouseId } from '@/lib/domain/ids'
import type { SettingsPatch } from '@/lib/domain/profile'
import { mySettingsSchema, notificationToggleSchema } from '@/lib/schemas/me'
import { makeAction } from '@/lib/server/action'

// Zod has checked the shapes; the local times are just those strings.
export async function updateMySettingsAction(houseId: HouseId, input: unknown) {
  return makeAction(
    mySettingsSchema,
    (deps, actor, i) => makeUpdateMySettings(deps)(actor, i as SettingsPatch),
    houseEnv(houseId),
  )(input)
}

export async function setNotificationEnabledAction(houseId: HouseId, input: unknown) {
  return makeAction(
    notificationToggleSchema,
    (deps, actor, i) => makeSetNotificationEnabled(deps)(actor, i),
    houseEnv(houseId),
  )(input)
}
