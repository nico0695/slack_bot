import {
  computeNextTriggerAt,
  getOccurrenceDateKey,
  isBeforeScheduledTime,
  matchesOccurrenceDate,
  validateRecurrenceConfig,
} from '../remindersSchedule.utils'
import { ReminderRecurrenceType, ReminderWeekDay } from '../../constants/reminders.constants'

function expectLocalDateParts(
  date: Date,
  expected: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
  }
): void {
  expect(date.getFullYear()).toBe(expected.year)
  expect(date.getMonth()).toBe(expected.month)
  expect(date.getDate()).toBe(expected.day)
  expect(date.getHours()).toBe(expected.hour)
  expect(date.getMinutes()).toBe(expected.minute)
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
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '09:00',
        },
        new Date(2026, 0, 7, 8, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 0,
        day: 7,
        hour: 9,
        minute: 0,
      })
    })

    it('returns next day when scheduled time already passed', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '09:00',
        },
        new Date(2026, 0, 7, 10, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 0,
        day: 8,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('computeNextTriggerAt weekly', () => {
    it('uses the next configured weekday in the same week', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        },
        new Date(2026, 0, 7, 10, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 0,
        day: 9,
        hour: 9,
        minute: 0,
      })
    })

    it('keeps same weekday when current time is before schedule', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        },
        new Date(2026, 0, 7, 8, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 0,
        day: 7,
        hour: 9,
        minute: 0,
      })
    })

    it('jumps to next valid weekday in the following week', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [ReminderWeekDay.MONDAY, ReminderWeekDay.WEDNESDAY],
        },
        new Date(2026, 0, 9, 10, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 0,
        day: 12,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('computeNextTriggerAt monthly', () => {
    it('uses the next valid month day in the current month', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [30, 31],
        },
        new Date(2026, 3, 29, 8, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 3,
        day: 30,
        hour: 9,
        minute: 0,
      })
    })

    it('does not lose valid month days in future months when first candidate is invalid', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [31, 30],
        },
        new Date(2026, 3, 30, 10, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 4,
        day: 30,
        hour: 9,
        minute: 0,
      })
    })

    it('skips months where configured month day does not exist', () => {
      const result = computeNextTriggerAt(
        {
          recurrenceType: ReminderRecurrenceType.MONTHLY,
          timeOfDay: '09:00',
          monthDays: [31],
        },
        new Date(2026, 3, 30, 10, 0, 0, 0)
      )

      expectLocalDateParts(result, {
        year: 2026,
        month: 4,
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
          new Date(2026, 0, 7, 23, 0, 0, 0)
        )
      ).toBe(true)
    })

    it('matches weekly reminders by weekday only', () => {
      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.WEEKLY,
            timeOfDay: '09:00',
            weekDays: [ReminderWeekDay.WEDNESDAY],
          },
          new Date(2026, 0, 7, 20, 0, 0, 0)
        )
      ).toBe(true)

      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.WEEKLY,
            timeOfDay: '09:00',
            weekDays: [ReminderWeekDay.WEDNESDAY],
          },
          new Date(2026, 0, 8, 20, 0, 0, 0)
        )
      ).toBe(false)
    })

    it('matches monthly reminders by month day only', () => {
      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.MONTHLY,
            timeOfDay: '09:00',
            monthDays: [7, 15],
          },
          new Date(2026, 0, 7, 20, 0, 0, 0)
        )
      ).toBe(true)

      expect(
        matchesOccurrenceDate(
          {
            recurrenceType: ReminderRecurrenceType.MONTHLY,
            timeOfDay: '09:00',
            monthDays: [7, 15],
          },
          new Date(2026, 0, 8, 20, 0, 0, 0)
        )
      ).toBe(false)
    })
  })

  describe('helpers', () => {
    it('builds occurrence date key in YYYY-MM-DD format', () => {
      const result = getOccurrenceDateKey(new Date(2026, 0, 7, 10, 0, 0, 0))

      expect(result).toBe('2026-01-07')
    })

    it('detects when current time is before schedule time', () => {
      expect(isBeforeScheduledTime(new Date(2026, 0, 7, 8, 30, 0, 0), '09:00')).toBe(true)
      expect(isBeforeScheduledTime(new Date(2026, 0, 7, 9, 0, 0, 0), '09:00')).toBe(false)
    })
  })
})
