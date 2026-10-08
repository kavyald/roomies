import { z } from './zod'

const option = z.object({ label: z.string().max(200), note: z.string().max(1000).optional() })

export const createPollSchema = z.object({
  question: z.string().max(400),
  itemId: z.uuid().optional(),
  options: z.array(option).max(20),
  closesAt: z.iso.datetime({ offset: true }).optional(),
})
export const voteSchema = z.object({ pollId: z.uuid(), optionId: z.uuid() })
export const addPollOptionSchema = z.object({
  pollId: z.uuid(),
  label: z.string().max(200),
  note: z.string().max(1000).optional(),
})
export const closePollSchema = z.object({ pollId: z.uuid() })
export const withdrawVoteSchema = z.object({ pollId: z.uuid() })
export const reopenPollSchema = z.object({ pollId: z.uuid() })
/** `closesAt: null` clears the deadline. */
export const setPollDeadlineSchema = z.object({
  pollId: z.uuid(),
  closesAt: z.iso.datetime({ offset: true }).nullable(),
})
