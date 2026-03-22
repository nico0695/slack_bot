import { z } from 'zod'

export const qrSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Content cannot be empty')
    .max(2000, 'Content exceeds maximum length of 2000 characters'),
})
