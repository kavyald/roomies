import { z } from './zod'
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
export const finishRunSchema = z.object({
  runId: z.uuid(),
  spent: z.number().int().optional(),
  paidBy: z.uuid().optional(),
  note,
})
export const startRequestSchema = z.object({ contactId: z.uuid(), itemIds: ids })
export const planVisitSchema = z.object({
  contactId: z.uuid(),
  itemIds: ids,
  when: whenSchema.optional(),
})
export const addToRequestSchema = z.object({ taskId: z.uuid() })
export const sendRequestSchema = z.object({
  runId: z.uuid(),
  via: z.enum(['text', 'email', 'call', 'portal', 'in_person']),
})
export const handToContactSchema = z.object({
  runId: z.uuid(),
  itemIds: ids,
  contactId: z.uuid(),
  note,
})
export const moveToNewVisitSchema = z.object({
  fromRunId: z.uuid(),
  itemIds: ids,
  when: whenSchema.optional(),
  contactId: z.uuid().optional(),
  note,
})
export const renameRunSchema = z.object({ runId: z.uuid(), title: z.string().max(200).nullable() })
export const setRunnerSchema = z.object({ runId: z.uuid(), runner: z.uuid() })
export const setVisitDateSchema = z.object({ runId: z.uuid(), when: whenSchema.nullable() })
