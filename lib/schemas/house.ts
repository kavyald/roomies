import { z } from './zod'

export const editContactSchema = z.object({
  id: z.uuid(),
  patch: z.object({
    name: z.string().max(60).optional(),
    phone: z.string().max(40).optional(),
    note: z.string().max(280).optional(),
  }),
})
export const idSchema = z.uuid()
export const moveOutSchema = z.object({ userId: z.uuid(), note: z.string().max(280).optional() })
export const setRoleSchema = z.object({ userId: z.uuid(), role: z.enum(['admin', 'member']) })
export const renameRoomSchema = z.object({ roomId: z.uuid(), name: z.string().max(60) })
export const moveRoomSchema = z.object({ roomId: z.uuid(), direction: z.enum(['up', 'down']) })
export const nothingSchema = z.undefined()
const weight = z.number().int()
export const feelingWeightsSchema = z.object({
  anxious: weight,
  frustrated: weight,
  confused: weight,
  fine: weight,
  meh: weight,
  thanks: weight,
})
