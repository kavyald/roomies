import { z } from 'zod'

export const emailSchema = z
  .email()
  .max(254)
  .transform((e) => e.trim().toLowerCase())
export const codeSchema = z.string().regex(/^\d{6}$/)
