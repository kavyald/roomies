import { z } from 'zod'

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const mySettingsSchema = z.object({
  theme: z.enum(['auto', 'light', 'dark']).optional(),
  quietHours: z.object({ start: time, end: time }).nullable().optional(),
})
export const notificationToggleSchema = z.object({
  category: z.enum(['assigned', 'due', 'feelings', 'polls', 'runs', 'people']),
  enabled: z.boolean(),
})
