import { z } from 'zod'
import { whenSchema } from './items'

const ids = z.array(z.uuid()).max(200)
const note = z.string().max(280).optional()

export const startRunSchema = z.object({
  title: z.string().max(200).optional(),
  when: whenSchema.optional(),
  runner: z.uuid().optional(),
  itemIds: ids,
})
export const addToRunSchema = z.object({ runId: z.uuid(), itemIds: ids })
export const runItemsSchema = z.object({ runId: z.uuid(), itemIds: ids })
export const moveRunItemsSchema = z.object({
  fromRunId: z.uuid(),
  toRunId: z.uuid(),
  itemIds: ids,
  note,
})
export const returnToPoolSchema = z.object({
  runId: z.uuid(),
  itemIds: ids,
  note,
  clearContact: z.boolean(),
})
export const finishRunSchema = z.object({ runId: z.uuid() })
