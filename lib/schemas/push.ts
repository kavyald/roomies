import { z } from './zod'

/** A browser's push endpoint, as `pushManager.getSubscription()` gives it. */
export const pushEndpointSchema = z.object({ endpoint: z.string().max(2000) })

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
})
