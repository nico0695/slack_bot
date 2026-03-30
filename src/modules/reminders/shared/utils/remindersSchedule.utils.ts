import { ReminderRecurrenceType, ReminderWeekDay } from '../constants/reminders.constants'
import { IReminder, IReminderValidationResult } from '../interfaces/reminders.interfaces'

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = timeOfDay.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Invalid timeOfDay format')
  }

  return { hour, minute }
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
  const { hour, minute } = parseTimeOfDay(reminder.timeOfDay)
  const candidate = new Date(fromDate)
  candidate.setHours(hour, minute, 0, 0)

  if (reminder.recurrenceType === ReminderRecurrenceType.DAILY) {
    if (candidate <= fromDate) {
      candidate.setDate(candidate.getDate() + 1)
    }

    return candidate
  }

  if (reminder.recurrenceType === ReminderRecurrenceType.WEEKLY) {
    const weekDays = [...(reminder.weekDays ?? [])].sort((a, b) => a - b)

    if (weekDays.length === 0) {
      return candidate
    }

    const currentDay = candidate.getDay()
    for (const weekDay of weekDays) {
      if (weekDay > currentDay || (weekDay === currentDay && candidate > fromDate)) {
        candidate.setDate(candidate.getDate() + (weekDay - currentDay))
        return candidate
      }
    }

    const daysToAdd = 7 - currentDay + weekDays[0]
    candidate.setDate(candidate.getDate() + daysToAdd)
    return candidate
  }

  const monthDays = [...(reminder.monthDays ?? [])].sort((a, b) => a - b)

  if (monthDays.length === 0) {
    if (candidate <= fromDate) {
      candidate.setDate(candidate.getDate() + 1)
    }
    return candidate
  }

  for (let monthOffset = 0; monthOffset <= 24; monthOffset += 1) {
    const monthCursor = new Date(fromDate)
    monthCursor.setMonth(fromDate.getMonth() + monthOffset, 1)
    monthCursor.setHours(hour, minute, 0, 0)
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

  return candidate
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
  const localDateKey = getOccurrenceDateKey(localDate)
  const candidate = computeNextTriggerAt(reminder, new Date(localDate))

  return getOccurrenceDateKey(candidate) === localDateKey
}

export function isBeforeScheduledTime(localNow: Date, timeOfDay: string): boolean {
  const { hour, minute } = parseTimeOfDay(timeOfDay)
  const scheduledDate = new Date(localNow)
  scheduledDate.setHours(hour, minute, 0, 0)

  return localNow < scheduledDate
}

export const reminderWeekDayValues = Object.values(ReminderWeekDay).filter(
  (value): value is ReminderWeekDay => typeof value === 'number'
)
