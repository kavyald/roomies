import { FEEDBACK_KINDS, MAX_FEEDBACK } from '../domain/feedback'
import { z } from './zod'

// Only what the person chose and wrote: the server stamps the version and user agent (T91).
export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1).max(MAX_FEEDBACK),
})
