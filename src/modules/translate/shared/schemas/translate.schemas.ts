import { z } from 'zod'

export const translateSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(5000),
  targetLang: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z][A-Za-z \-+()\\/.,]*$/, 'Invalid target language format'),
})
