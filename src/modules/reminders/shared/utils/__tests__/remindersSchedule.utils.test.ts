import {
  computeNextTriggerAt,
  getOccurrenceDateKey,
  isBeforeScheduledTime,
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

    it('does not lose valid monthDays in future months when the first one is invalid', () => {
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

    it('skips months where the configured month day does not exist', () => {
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

  describe('helpers', () => {
    it('builds occurrence date key in YYYY-MM-DD format', () => {
      const result = getOccurrenceDateKey(new Date(2026, 0, 7, 10, 0, 0, 0))

      expect(result).toBe('2026-01-07')
    })

    it('detects when current time is before the schedule time', () => {
      expect(isBeforeScheduledTime(new Date(2026, 0, 7, 8, 30, 0, 0), '09:00')).toBe(true)
      expect(isBeforeScheduledTime(new Date(2026, 0, 7, 9, 0, 0, 0), '09:00')).toBe(false)
    })
  })

  describe('computeNextTriggerAt non-monthly smoke', () => {
    it('computes next daily trigger when current day time already passed', () => {
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

    it('computes next weekly trigger from configured weekdays', () => {
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
  })
})
