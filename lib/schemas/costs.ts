import { z } from './zod'

export const addCostSchema = z.object({
  amount: z.number().int(),
  paidBy: z.uuid().optional(),
  note: z.string().max(1000).optional(),
  itemId: z.uuid().optional(),
  runId: z.uuid().optional(),
})
export const costIdSchema = z.object({ costId: z.uuid() })
