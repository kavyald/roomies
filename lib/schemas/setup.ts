import { z } from './zod'

export const newHouseSchema = z.object({
  houseName: z.string().max(80),
  address: z.string().max(200).optional(),
  unit: z.string().max(40).optional(),
  timezone: z.string().max(64),
  ownerName: z.string().max(60),
  bedroom: z.enum(['air', 'fire', 'water', 'earth']).optional(),
})
