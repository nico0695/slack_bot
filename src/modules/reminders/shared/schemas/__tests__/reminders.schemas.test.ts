import {
  checkReminderSchema,
  createReminderSchema,
  getRemindersQuerySchema,
} from '../reminders.schemas'
import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
  ReminderWeekDay,
} from '../../constants/reminders.constants'

describe('reminders.schemas', () => {
  describe('createReminderSchema', () => {
    it('accepts a valid daily reminder payload', () => {
      const result = createReminderSchema.parse({
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
      })

      expect(result).toMatchObject({
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
      })
    })

    it('rejects weekly reminders without weekDays', () => {
      const result = createReminderSchema.safeParse({
        message: 'Team sync',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '10:30',
      })

      expect(result.success).toBe(false)
    })

    it('rejects monthly reminders without monthDays', () => {
      const result = createReminderSchema.safeParse({
        message: 'Monthly billing',
        recurrenceType: ReminderRecurrenceType.MONTHLY,
        timeOfDay: '08:00',
      })

      expect(result.success).toBe(false)
    })

    it('rejects daily reminders with weekly config', () => {
      const result = createReminderSchema.safeParse({
        message: 'Bad daily',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '12:00',
        weekDays: [ReminderWeekDay.MONDAY],
      })

      expect(result.success).toBe(false)
    })
  })

  describe('getRemindersQuerySchema', () => {
    it('accepts personal scope query', () => {
      const result = getRemindersQuerySchema.parse({
        scope: ReminderScope.PERSONAL,
        page: '1',
        pageSize: '10',
      })

      expect(result).toMatchObject({
        scope: ReminderScope.PERSONAL,
        page: 1,
        pageSize: 10,
      })
    })

    it('requires channelId for channel scope', () => {
      const result = getRemindersQuerySchema.safeParse({
        scope: ReminderScope.CHANNEL,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('checkReminderSchema', () => {
    it('accepts valid occurrence date', () => {
      const result = checkReminderSchema.parse({
        occurrenceDate: '2026-03-29',
      })

      expect(result.occurrenceDate).toBe('2026-03-29')
    })

    it('rejects invalid occurrence date', () => {
      const result = checkReminderSchema.safeParse({
        occurrenceDate: '29-03-2026',
      })

      expect(result.success).toBe(false)
    })
  })
})
