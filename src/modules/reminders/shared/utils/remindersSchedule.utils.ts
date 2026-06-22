import {
  ARGENTINA_TIMEZONE,
  ARGENTINA_UTC_OFFSET_MINUTES,
} from '../../../../shared/constants/timezone.constants'
import { ReminderRecurrenceType, ReminderWeekDay } from '../constants/reminders.constants'
import { IReminder, IReminderValidationResult } from '../interfaces/reminders.interfaces'

interface ArgentinaDateParts {
  year: number
  month: number
  day: number
  dayOfWeek: number
  hour: number
  minute: number
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getArgentinaDateParts(date: Date): ArgentinaDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0'

  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const dayOfWeek = DAY_NAME_TO_INDEX[get('weekday')] ?? 0
  let hour = Number(get('hour'))
  const minute = Number(get('minute'))

  if (hour === 24) {
    hour = 0
  }

  return { year, month, day, dayOfWeek, hour, minute }
}

function buildArgentinaTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const utcDate = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  return new Date(utcDate + ARGENTINA_UTC_OFFSET_MINUTES * 60 * 1000)
}

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = timeOfDay.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Invalid timeOfDay format')
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Invalid timeOfDay format')
  }
  return { hour, minute }
}

function buildScheduledDate(baseDate: Date, timeOfDay: string): Date {
  const { hour, minute } = parseTimeOfDay(timeOfDay)
  const arParts = getArgentinaDateParts(baseDate)

  return buildArgentinaTimestamp(arParts.year, arParts.month, arParts.day, hour, minute)
}

export function validateRecurrenceConfig(
  reminderInput: Pick<IReminder, 'recurrenceType' | 'weekDays' | 'monthDays'>
): IReminderValidationResult {
  const weekDays = reminderInput.weekDays ?? null
  const monthDays = reminderInput.monthDays ?? null

  if (reminderInput.recurrenceType === ReminderRecurrenceType.DAILY) {
    if ((weekDays && weekDays.length > 0) || (monthDays && monthDays.length > 0)) {
      return {
        isValid: false,
        error: 'Daily reminders must not define weekDays or monthDays',
      }
    }
  }

  if (reminderInput.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    if (!weekDays || weekDays.length === 0) {
      return {
        isValid: false,
        error: 'Weekly reminders require at least one week day',
      }
    }

    if (monthDays && monthDays.length > 0) {
      return {
        isValid: false,
        error: 'Weekly reminders must not define monthDays',
      }
    }
  }

  if (reminderInput.recurrenceType === ReminderRecurrenceType.MONTHLY) {
    if (!monthDays || monthDays.length === 0) {
      return {
        isValid: false,
        error: 'Monthly reminders require at least one month day',
      }
    }

    if (weekDays && weekDays.length > 0) {
      return {
        isValid: false,
        error: 'Monthly reminders must not define weekDays',
      }
    }
  }

  return { isValid: true }
}

export function computeNextTriggerAt(
  reminder: Pick<IReminder, 'recurrenceType' | 'timeOfDay' | 'weekDays' | 'monthDays'>,
  fromDate: Date
): Date {
  const candidate = buildScheduledDate(fromDate, reminder.timeOfDay)

  if (reminder.recurrenceType === ReminderRecurrenceType.DAILY) {
    if (candidate <= fromDate) {
      const arParts = getArgentinaDateParts(candidate)
      return buildArgentinaTimestamp(
        arParts.year,
        arParts.month,
        arParts.day + 1,
        arParts.hour,
        arParts.minute
      )
    }

    return candidate
  }

  if (reminder.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    const weekDays = [...(reminder.weekDays ?? [])].sort((a, b) => a - b)

    if (weekDays.length === 0) {
      throw new Error('Weekly reminders require at least one week day')
    }

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const arParts = getArgentinaDateParts(candidate)
      const weeklyCandidate = buildArgentinaTimestamp(
        arParts.year,
        arParts.month,
        arParts.day + dayOffset,
        arParts.hour,
        arParts.minute
      )

      const candidateParts = getArgentinaDateParts(weeklyCandidate)

      if (!weekDays.includes(candidateParts.dayOfWeek)) {
        continue
      }

      if (weeklyCandidate > fromDate) {
        return weeklyCandidate
      }
    }
  }

  const monthDays = [...(reminder.monthDays ?? [])].sort((a, b) => a - b)

  if (monthDays.length === 0) {
    throw new Error('Monthly reminders require at least one month day')
  }

  const candidateParts = getArgentinaDateParts(candidate)

  for (let monthOffset = 0; monthOffset <= 24; monthOffset += 1) {
    const targetMonth = ((candidateParts.month - 1 + monthOffset) % 12) + 1
    const targetYear =
      candidateParts.year + Math.floor((candidateParts.month - 1 + monthOffset) / 12)

    for (const monthDay of monthDays) {
      const monthlyCandidate = buildArgentinaTimestamp(
        targetYear,
        targetMonth,
        monthDay,
        candidateParts.hour,
        candidateParts.minute
      )

      const monthlyParts = getArgentinaDateParts(monthlyCandidate)

      if (monthlyParts.month !== targetMonth) {
        continue
      }

      if (monthlyCandidate > fromDate) {
        return monthlyCandidate
      }
    }
  }

  throw new Error('Unable to compute next trigger date')
}

export function getOccurrenceDateKey(triggerAt: Date): string {
  const arParts = getArgentinaDateParts(triggerAt)
  const year = arParts.year
  const month = String(arParts.month).padStart(2, '0')
  const day = String(arParts.day).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function matchesOccurrenceDate(
  reminder: Pick<IReminder, 'timeOfDay' | 'recurrenceType' | 'weekDays' | 'monthDays'>,
  localDate: Date
): boolean {
  if (reminder.recurrenceType === ReminderRecurrenceType.DAILY) {
    return true
  }

  const arParts = getArgentinaDateParts(localDate)

  if (reminder.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    return (reminder.weekDays ?? []).includes(arParts.dayOfWeek)
  }

  return (reminder.monthDays ?? []).includes(arParts.day)
}

export function isBeforeScheduledTime(localNow: Date, timeOfDay: string): boolean {
  const scheduledDate = buildScheduledDate(localNow, timeOfDay)

  return localNow < scheduledDate
}

export const reminderWeekDayValues = Object.values(ReminderWeekDay).filter(
  (value): value is ReminderWeekDay => typeof value === 'number'
)
