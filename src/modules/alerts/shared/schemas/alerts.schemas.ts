import { z } from 'zod'

export const createAlertSchema = z
  .object({
    message: z.string().min(1),
    date: z.coerce.date(),
    requestId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase())
      .optional(),
    source: z.string().trim().min(1).max(50).optional(),
    deviceId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((data) => data.requestId || (!data.source && !data.deviceId), {
    message: 'source y deviceId requieren requestId',
    path: ['requestId'],
  })
