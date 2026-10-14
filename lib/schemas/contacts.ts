import { z } from './zod'

/** Input for creating a contact, as sent from the browser. */
export const newContactSchema = z.object({
  name: z.string().max(60),
  phone: z.string().max(40).optional(),
  note: z.string().max(280).optional(),
})
