// What every house action shares: who's acting, the request's deps, and sending any notifications
// the change enqueued once the response is on its way (ARCHITECTURE §7.1: "right after commit").
import { after } from 'next/server'
import { depsForRequest, sendNotificationsNow } from '@/lib/compose'
import type { HouseId } from '@/lib/domain/ids'
import type { ActionEnv } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

export const houseEnv = (houseId: HouseId): ActionEnv => ({
  currentActor: () => currentActor(houseId),
  deps: (actor) => depsForRequest({ actor }),
  afterSuccess: () => after(sendNotificationsNow),
})
