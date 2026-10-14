'use server'

import { headers } from 'next/headers'
import { houseEnv } from './env'
import { makeSendFeedback } from '@/lib/app/feedback'
import type { HouseId } from '@/lib/domain/ids'
import { feedbackSchema } from '@/lib/schemas/feedback'
import { makeAction } from '@/lib/server/action'

// The client sends only the kind and the message; the browser comes from the request and the
// version from config (T91).
export async function sendFeedbackAction(houseId: HouseId, input: unknown) {
  const userAgent = (await headers()).get('user-agent')
  return makeAction(
    feedbackSchema,
    (deps, actor, i) => makeSendFeedback(deps)(actor, i, { userAgent }),
    houseEnv(houseId),
  )(input)
}
