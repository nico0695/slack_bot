import {
  computeNextTriggerAt,
  getOccurrenceDateKey,
  isBeforeScheduledTime,
  matchesOccurrenceDate,
  validateRecurrenceConfig,
} from '../remindersSchedule.utils'
import { ReminderRecurrenceType, ReminderWeekDay } from '../../constants/reminders.constants'

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires'

function expectArgentinaDateParts(
  date: Date,
  expected: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
  }
): void {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0'

  let hour = Number(get('hour'))
  if (hour === 24) hour = 0

  expect(Number(get('year'))).toBe(expected.year)
  expect(Number(get('month'))).toBe(expected.month)
  expect(Number(get('day'))).toBe(expected.day)
  expect(hour).toBe(expected.hour)
  expect(Number(get('minute'))).toBe(expected.minute)
}

function argentinaDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(utcGuess)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0'

  let arHour = Number(get('hour'))
  if (arHour === 24) arHour = 0
  const arMinute = Number(get('minute'))

  const targetMinutes = hour * 60 + minute
  const actualMinutes = arHour * 60 + arMinute
  const diffMinutes = targetMinutes - actualMinutes

  return new Date(utcGuess.getTime() + diffMinutes * 60 * 1000)
}

describe('remindersSchedule.utils', () => {
  describe('validateRecurrenceConfig', () => {
    it('rejects weekly reminders without weekdays', () => {
      expect(
        validateRecurrenceConfig({
          recurrenceType: ReminderRecurrenceType.WEEKLY,
        } as any)
      ).toEqual({
        isValid: false,
        error: 'Weekly reminders require at least one week day',
      })
    })

    it('rejects monthly reminders without month days', () => {
      expect(
        validateRecurrenceConfig({
          recurrenceType: ReminderRecurrenceType.MONTHLY,
        } as any)
      ).toEqual({
        isValid: false,
        error: 'Monthly reminders require at least one month day',
      })
    })

    it('rejects daily reminders with weekly or monthly config', () => {
      expect(
        validateRecurrenceConfig({
          recurrenceType: ReminderRecurrenceType.DAILY,
          weekDays: [ReminderWeekDay.MONDAY],
          monthDays: [1],
        } as any)
      ).toEqual({
        isValid: false,
        error: 'Daily reminders must not define weekDays or monthDays',
      })
    })
  })

  describe('computeNextTriggerAt daily', () => {
    it('returns same day when scheduled time is still ahead', () => {
      const fromDate = argentinaDate(2026, 1, 7, 8, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '09:00',
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 1,
        day: 7,
        hour: 9,
        minute: 0,
      })
    })

    it('returns next day when scheduled time already passed', () => {
      const fromDate = argentinaDate(2026, 1, 7, 10, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '09:00',
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 1,
        day: 8,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('computeNextTriggerAt weekly', () => {
    it('uses the next configured weekday in the same week', () => {
      const fromDate = argentinaDate(2026, 1, 7, 10, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 1,
        day: 9,
        hour: 9,
        minute: 0,
      })
    })

    it('keeps same weekday when current time is before schedule', () => {
      const fromDate = argentinaDate(2026, 1, 7, 8, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 1,
        day: 7,
        hour: 9,
        minute: 0,
      })
    })

    it('jumps to next valid weekday in the following week', () => {
      const fromDate = argentinaDate(2026, 1, 9, 10, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.MONDAY, ReminderWeekDay.WEDNESDAY],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 1,
        day: 12,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('computeNextTriggerAt monthly', () => {
    it('uses the next valid month day in the current month', () => {
      const fromDate = argentinaDate(2026, 4, 29, 8, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [30, 31],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 4,
        day: 30,
        hour: 9,
        minute: 0,
      })
    })

    it('does not lose valid month days in future months when first candidate is invalid', () => {
      const fromDate = argentinaDate(2026, 4, 30, 10, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [31, 30],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 5,
        day: 30,
        hour: 9,
        minute: 0,
      })
    })

    it('skips months where configured month day does not exist', () => {
      const fromDate = argentinaDate(2026, 4, 30, 10, 0)

      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [31],
        },
        fromDate
      )

      expectArgentinaDateParts(result, {
        year: 2026,
        month: 5,
        day: 31,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('matchesOccurrenceDate', () => {
    it('matches daily reminders for every date', () => {
      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.DAILY,
            timeOfDay: '09:00',
          },
          argentinaDate(2026, 1, 7, 23, 0)
        )
      ).toBe(true)
    })

    it('matches weekly reminders by weekday in Argentina timezone', () => {
      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.WEEKLY,
            timeOfDay: '09:00',
            weekDays: [ReminderWeekDay.WEDNESDAY],
          },
          argentinaDate(2026, 1, 7, 20, 0)
        )
      ).toBe(true)

      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.WEEKLY,
            timeOfDay: '09:00',
            weekDays: [ReminderWeekDay.WEDNESDAY],
          },
          argentinaDate(2026, 1, 8, 20, 0)
        )
      ).toBe(false)
    })

    it('matches monthly reminders by month day in Argentina timezone', () => {
      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.MONTHLY,
            timeOfDay: '09:00',
            monthDays: [7, 15],
          },
          argentinaDate(2026, 1, 7, 20, 0)
        )
      ).toBe(true)

      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.MONTHLY,
            timeOfDay: '09:00',
            monthDays: [7, 15],
          },
          argentinaDate(2026, 1, 8, 20, 0)
        )
      ).toBe(false)
    })
  })

  describe('helpers', () => {
    it('builds occurrence date key in Argentina timezone', () => {
      const result = getOccurrenceDateKey(argentinaDate(2026, 1, 7, 10, 0))

      expect(result).toBe('2026-01-07')
    })

    it('returns Argentina date at UTC/Argentina day boundary', () => {
      const utcDate = new Date('2026-01-08T02:00:00Z')

      expect(getOccurrenceDateKey(utcDate)).toBe('2026-01-07')
    })

    it('detects when current time is before schedule time in Argentina timezone', () => {
      const before = argentinaDate(2026, 1, 7, 8, 30)
      const atTime = argentinaDate(2026, 1, 7, 9, 0)

      expect(isBeforeScheduledTime(before, '09:00')).toBe(true)
      expect(isBeforeScheduledTime(atTime, '09:00')).toBe(false)
    })
  })
})
