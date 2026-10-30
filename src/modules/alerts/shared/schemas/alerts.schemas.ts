import { z } from 'zod'
import { snoozePresets } from '../constants/snoozeCatalog'

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

// Visible catalog presets only: the hidden 09:00 preset is not part of the REST contract
const restSnoozePresetKeys = snoozePresets.map((preset) => preset.key)

export const snoozeAlertParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .refine(Number.isSafeInteger, { message: 'Expected a safe integer' }),
})

export const snoozeAlertBodySchema = z
  .object({
    preset: z.string().refine((key) => restSnoozePresetKeys.includes(key), {
      message: 'Unknown snooze preset',
    }),
    // UTC only, ending in Z
    expected_scheduled_at: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
  })
  .strict()
