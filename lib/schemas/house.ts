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
export const changeMyRoomSchema = z.object({ roomId: z.uuid().nullable() })
export const setRoleSchema = z.object({ userId: z.uuid(), role: z.enum(['admin', 'member']) })
export const renameRoomSchema = z.object({ roomId: z.uuid(), name: z.string().max(60) })
export const moveRoomSchema = z.object({ roomId: z.uuid(), direction: z.enum(['up', 'down']) })
const routineWho = z.discriminatedUnion('takesTurns', [
  z.object({ takesTurns: z.literal(true), startsWith: z.uuid() }),
  z.object({ takesTurns: z.literal(false), fixedMember: z.uuid() }),
])
const resets = z.enum(['weekly', 'biweekly', 'monthly'])
export const newRoutineSchema = z.object({
  name: z.string().max(200),
  icon: z.string().max(40),
  resets,
  who: routineWho,
  roomIds: z.array(z.uuid()).max(100),
})
export const editRoutineSchema = z.object({
  id: z.uuid(),
  patch: z.object({
    name: z.string().max(200).optional(),
    icon: z.string().max(40).optional(),
    resets: resets.optional(),
    who: routineWho.optional(),
    roomIds: z.array(z.uuid()).max(100).optional(),
  }),
  /** The routine's version when the sheet opened: a newer save makes this a conflict (§7.5). */
  version: z.string().max(40).optional(),
})
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
