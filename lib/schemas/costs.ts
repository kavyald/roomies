import { z } from './zod'

export const addCostSchema = z.object({
  amount: z.number().int(),
  paidBy: z.uuid().optional(),
  note: z.string().max(1000).optional(),
  itemId: z.uuid().optional(),
  runId: z.uuid().optional(),
})
export const costIdSchema = z.object({ costId: z.uuid() })
export const editCostSchema = z.object({
  costId: z.uuid(),
  amount: z.number().int().optional(),
  paidBy: z.uuid().optional(),
  note: z.string().max(1000).nullable().optional(),
})
