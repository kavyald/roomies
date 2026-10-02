import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const whenSchema = z.object({ date, time: time.optional() })
const priority = z.enum(['low', 'normal', 'high', 'urgent'])

export const newItemSchema = z.object({
  category: z.enum(['need', 'chore', 'task']),
  title: z.string().max(200),
  note: z.string().max(1000).optional(),
  roomId: z.uuid().optional(),
  assignee: z.uuid().optional(),
  when: whenSchema.optional(),
  priority: priority.optional(),
  repeatDays: z.number().int().nullable().optional(),
  contactId: z.uuid().optional(),
})

export const itemPatchSchema = z.object({
  id: z.uuid(),
  patch: z.object({
    title: z.string().max(200).optional(),
    note: z.string().max(1000).nullable().optional(),
    roomId: z.uuid().nullable().optional(),
    assignee: z.uuid().nullable().optional(),
    when: whenSchema.nullable().optional(),
    priority: priority.optional(),
    repeatDays: z.number().int().nullable().optional(),
    contactId: z.uuid().nullable().optional(),
  }),
})

export const itemIdSchema = z.uuid()

/** Undo for Did it: the chore, and the last done (ms since epoch) that Did it set. */
export const undoChoreSchema = z.object({ id: z.uuid(), doneAt: z.number().int() })

export const setFeelingSchema = z.object({
  itemId: z.uuid(),
  kind: z.enum(['anxious', 'frustrated', 'confused', 'fine', 'meh', 'thanks']).nullable(),
  note: z.string().max(1000).optional(),
})
