import { ReminderRecurrenceType, ReminderWeekDay } from '../constants/reminders.constants'
import { IReminder, IReminderValidationResult } from '../interfaces/reminders.interfaces'

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
  const scheduledDate = new Date(baseDate)
  scheduledDate.setHours(hour, minute, 0, 0)

  return scheduledDate
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
      candidate.setDate(candidate.getDate() + 1)
    }

    return candidate
  }

  if (reminder.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    const weekDays = [...(reminder.weekDays ?? [])].sort((a, b) => a - b)

    if (weekDays.length === 0) {
      throw new Error('Weekly reminders require at least one week day')
    }

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const weeklyCandidate = new Date(candidate)
      weeklyCandidate.setDate(candidate.getDate() + dayOffset)

      if (!weekDays.includes(weeklyCandidate.getDay())) {
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

  for (let monthOffset = 0; monthOffset <= 24; monthOffset += 1) {
    const monthCursor = new Date(fromDate)
    monthCursor.setMonth(fromDate.getMonth() + monthOffset, 1)
    monthCursor.setHours(candidate.getHours(), candidate.getMinutes(), 0, 0)
    const expectedMonth = monthCursor.getMonth()

    for (const monthDay of monthDays) {
      const monthlyCandidate = new Date(monthCursor)
      monthlyCandidate.setDate(monthDay)

      if (monthlyCandidate.getMonth() !== expectedMonth) {
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
  const year = triggerAt.getFullYear()
  const month = String(triggerAt.getMonth() + 1).padStart(2, '0')
  const day = String(triggerAt.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function matchesOccurrenceDate(
  reminder: Pick<IReminder, 'timeOfDay' | 'recurrenceType' | 'weekDays' | 'monthDays'>,
  localDate: Date
): boolean {
  if (reminder.recurrenceType === ReminderRecurrenceType.DAILY) {
    return true
  }

  if (reminder.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    return (reminder.weekDays ?? []).includes(localDate.getDay())
  }

  return (reminder.monthDays ?? []).includes(localDate.getDate())
}

export function isBeforeScheduledTime(localNow: Date, timeOfDay: string): boolean {
  const scheduledDate = buildScheduledDate(localNow, timeOfDay)

  return localNow < scheduledDate
}

export const reminderWeekDayValues = Object.values(ReminderWeekDay).filter(
  (value): value is ReminderWeekDay => typeof value === 'number'
)
