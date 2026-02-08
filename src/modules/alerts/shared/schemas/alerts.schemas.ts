import { z } from 'zod'

export const createAlertSchema = z.object({
  message: z.string().min(1),
  date: z.coerce.date(),
})
