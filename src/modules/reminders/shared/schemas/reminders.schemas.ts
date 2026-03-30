import { z } from 'zod'

import { paginationSchema } from '../../../../shared/utils/validation'
import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
  ReminderWeekDay,
} from '../constants/reminders.constants'

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)

const weekDaysSchema = z
  .array(z.nativeEnum(ReminderWeekDay))
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: 'weekDays must not contain duplicates',
  })

const monthDaysSchema = z
  .array(z.coerce.number().int().min(1).max(31))
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: 'monthDays must not contain duplicates',
  })

function validateReminderRecurrence(
  input: {
    recurrenceType?: ReminderRecurrenceType
    weekDays?: ReminderWeekDay[] | null
    monthDays?: number[] | null
  },
  ctx: z.RefinementCtx
): void {
  const weekDays = input.weekDays ?? null
  const monthDays = input.monthDays ?? null

  if (input.recurrenceType === ReminderRecurrenceType.DAILY) {
    if (weekDays && weekDays.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekDays'],
        message: 'daily reminders must not define weekDays',
      })
    }

    if (monthDays && monthDays.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthDays'],
        message: 'daily reminders must not define monthDays',
      })
    }
  }

  if (input.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    if (!weekDays || weekDays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekDays'],
        message: 'weekly reminders require at least one week day',
      })
    }

    if (monthDays && monthDays.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthDays'],
        message: 'weekly reminders must not define monthDays',
      })
    }
  }

  if (input.recurrenceType === ReminderRecurrenceType.MONTHLY) {
    if (!monthDays || monthDays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthDays'],
        message: 'monthly reminders require at least one month day',
      })
    }

    if (weekDays && weekDays.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekDays'],
        message: 'monthly reminders must not define weekDays',
      })
    }
  }
}

export const createReminderSchema = z
  .object({
    message: z.string().min(1),
    recurrenceType: z.nativeEnum(ReminderRecurrenceType),
    timeOfDay: timeOfDaySchema,
    weekDays: weekDaysSchema.nullable().optional(),
    monthDays: monthDaysSchema.nullable().optional(),
    status: z.nativeEnum(ReminderStatus).optional().default(ReminderStatus.ACTIVE),
    channelId: z.string().min(1).nullable().optional(),
  })
  .superRefine(validateReminderRecurrence)

export const updateReminderSchema = z
  .object({
    message: z.string().min(1).optional(),
    recurrenceType: z.nativeEnum(ReminderRecurrenceType).optional(),
    timeOfDay: timeOfDaySchema.optional(),
    weekDays: weekDaysSchema.nullable().optional(),
    monthDays: monthDaysSchema.nullable().optional(),
    status: z.nativeEnum(ReminderStatus).optional(),
    channelId: z.string().min(1).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.weekDays &&
      input.weekDays.length > 0 &&
      input.monthDays &&
      input.monthDays.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekDays'],
        message: 'weekDays and monthDays cannot be defined together',
      })
    }

    validateReminderRecurrence(input, ctx)
  })

export const getRemindersQuerySchema = paginationSchema
  .extend({
    scope: z.nativeEnum(ReminderScope).default(ReminderScope.PERSONAL),
    channelId: z.string().min(1).optional(),
    status: z.nativeEnum(ReminderStatus).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.scope === ReminderScope.CHANNEL && !input.channelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelId'],
        message: 'channelId is required for channel scope',
      })
    }

    if (input.scope === ReminderScope.PERSONAL && input.channelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelId'],
        message: 'channelId is not allowed for personal scope',
      })
    }
  })

export const checkReminderSchema = z.object({
  occurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
