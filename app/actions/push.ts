'use server'

import { headers } from 'next/headers'
import { houseEnv } from './env'
import { makeSavePushSubscription } from '@/lib/app/push'
import type { HouseId } from '@/lib/domain/ids'
import { pushSubscriptionSchema } from '@/lib/schemas/push'
import { makeAction } from '@/lib/server/action'

/** "Turn on notifications": this browser's subscription, saved for the signed-in member. */
export async function savePushSubscriptionAction(houseId: HouseId, input: unknown) {
  const userAgent = (await headers()).get('user-agent') ?? undefined
  return makeAction(
    pushSubscriptionSchema,
    (deps, actor, i) =>
      makeSavePushSubscription(deps)(actor, { subscription: i, ...(userAgent && { userAgent }) }),
    houseEnv(houseId),
  )(input)
}
