import { z } from 'zod'

export const newInviteSchema = z.object({
  maxUses: z.number().int().optional(),
  ttlDays: z.number().int().optional(),
})
export const inviteIdSchema = z.uuid()
export const joinSchema = z.object({
  displayName: z.string().max(60),
  roomId: z.uuid().optional(),
})
