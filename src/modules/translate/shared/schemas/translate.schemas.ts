import { z } from 'zod'

export const translateSchema = z.object({
  text: z.string().min(1),
  targetLang: z.string().min(1),
})
