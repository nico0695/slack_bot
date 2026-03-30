import RemindersServices from '../reminders.services'
import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
} from '../../shared/constants/reminders.constants'

const computeNextTriggerAtMock = jest.fn()
const getOccurrenceDateKeyMock = jest.fn()
const validateRecurrenceConfigMock = jest.fn()

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

jest.mock('../../shared/utils/remindersSchedule.utils', () => ({
  computeNextTriggerAt: (...args: any[]) => computeNextTriggerAtMock(...args),
  getOccurrenceDateKey: (...args: any[]) => getOccurrenceDateKeyMock(...args),
  validateRecurrenceConfig: (...args: any[]) => validateRecurrenceConfigMock(...args),
}))

const createReminderMock = jest.fn()
const getRemindersByScopeMock = jest.fn()
const getReminderByIdMock = jest.fn()
const updateReminderMock = jest.fn()
const deleteReminderMock = jest.fn()
const getDueRemindersMock = jest.fn()

const createReminderCheckMock = jest.fn()

const remindersDataSourceMock = {
  createReminder: createReminderMock,
  getRemindersByScope: getRemindersByScopeMock,
  getReminderById: getReminderByIdMock,
  updateReminder: updateReminderMock,
  deleteReminder: deleteReminderMock,
  getDueReminders: getDueRemindersMock,
}

const reminderChecksDataSourceMock = {
  createReminderCheck: createReminderCheckMock,
}

describe('RemindersServices', () => {
  let services: RemindersServices

  beforeEach(() => {
    jest.clearAllMocks()
    services = new RemindersServices(
      remindersDataSourceMock as any,
      reminderChecksDataSourceMock as any
    )
    validateRecurrenceConfigMock.mockReturnValue({ isValid: true })
  })

  describe('createReminder', () => {
    it('creates reminder with computed next trigger', async () => {
      const computedNextTriggerAt = new Date('2026-03-30T09:00:00.000Z')
      computeNextTriggerAtMock.mockReturnValue(computedNextTriggerAt)
      createReminderMock.mockResolvedValue({ id: 10 })

      const result = await services.createReminder({
        userId: 22,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
      })

      expect(createReminderMock).toHaveBeenCalledWith({
        userId: 22,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        nextTriggerAt: computedNextTriggerAt,
      })
      expect(result).toEqual({ data: { id: 10 } })
    })

    it('returns validation error when recurrence config is invalid', async () => {
      validateRecurrenceConfigMock.mockReturnValue({
        isValid: false,
        error: 'Weekly reminders require at least one week day',
      })

      const result = await services.createReminder({
        userId: 22,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '09:00',
      })

      expect(createReminderMock).not.toHaveBeenCalled()
      expect(result.error).toBe('Weekly reminders require at least one week day')
    })
  })

  it('gets reminders by scope', async () => {
    getRemindersByScopeMock.mockResolvedValue([{ id: 1 }])

    const result = await services.getRemindersByScope(5, {
      scope: ReminderScope.PERSONAL,
    })

    expect(getRemindersByScopeMock).toHaveBeenCalledWith(5, {
      scope: ReminderScope.PERSONAL,
    })
    expect(result).toEqual({ data: [{ id: 1 }] })
  })

  describe('getReminderById', () => {
    it('queries reminder by id and user ownership', async () => {
      getReminderByIdMock.mockResolvedValue({ id: 44 })

      const result = await services.getReminderById(44, 9)

      expect(getReminderByIdMock).toHaveBeenCalledWith(44, 9)
      expect(result).toEqual({ data: { id: 44 } })
    })

    it('returns not found when reminder does not belong to user', async () => {
      getReminderByIdMock.mockResolvedValue(null)

      const result = await services.getReminderById(44, 9)

      expect(result.error).toBe('Reminder not found')
    })
  })

  describe('pauseReminder', () => {
    it('pauses existing reminder', async () => {
      getReminderByIdMock
        .mockResolvedValueOnce({ id: 8 })
        .mockResolvedValueOnce({ id: 8, status: 'paused' })
      updateReminderMock.mockResolvedValue(undefined)

      const result = await services.pauseReminder(8, 3)

      expect(getReminderByIdMock).toHaveBeenNthCalledWith(1, 8, 3)
      expect(getReminderByIdMock).toHaveBeenNthCalledWith(2, 8, 3)
      expect(updateReminderMock).toHaveBeenCalledWith(8, { status: ReminderStatus.PAUSED })
      expect(result).toEqual({ data: { id: 8, status: 'paused' } })
    })
  })

  describe('resumeReminder', () => {
    it('recalculates next trigger from now and resumes reminder', async () => {
      const nextTriggerAt = new Date('2026-03-31T09:00:00.000Z')
      computeNextTriggerAtMock.mockReturnValue(nextTriggerAt)
      getReminderByIdMock
        .mockResolvedValueOnce({
          id: 12,
          recurrenceType: ReminderRecurrenceType.WEEKLY,
          timeOfDay: '09:00',
          weekDays: [1, 3],
          monthDays: null,
        })
        .mockResolvedValueOnce({ id: 12, status: ReminderStatus.ACTIVE, nextTriggerAt })
      updateReminderMock.mockResolvedValue(undefined)

      const result = await services.resumeReminder(12, 4)

      expect(getReminderByIdMock).toHaveBeenNthCalledWith(1, 12, 4)
      expect(getReminderByIdMock).toHaveBeenNthCalledWith(2, 12, 4)
      expect(updateReminderMock).toHaveBeenCalledWith(12, {
        status: ReminderStatus.ACTIVE,
        nextTriggerAt,
      })
      expect(result).toEqual({ data: { id: 12, status: ReminderStatus.ACTIVE, nextTriggerAt } })
    })
  })

  describe('deleteReminder', () => {
    it('maps affected rows to boolean', async () => {
      deleteReminderMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

      const success = await services.deleteReminder(11, 3)
      const failure = await services.deleteReminder(11, 3)

      expect(success).toEqual({ data: true })
      expect(failure).toEqual({ data: false })
    })
  })

  describe('checkReminderOccurrence', () => {
    it('creates reminder check for occurrence date', async () => {
      getReminderByIdMock.mockResolvedValue({ id: 20 })
      createReminderCheckMock.mockResolvedValue({ id: 99 })
      getOccurrenceDateKeyMock.mockReturnValue('2026-03-29')

      const result = await services.checkReminderOccurrence(20, 5)

      expect(getReminderByIdMock).toHaveBeenCalledWith(20, 5)
      expect(createReminderCheckMock).toHaveBeenCalledWith({
        reminderId: 20,
        checkedByUserId: 5,
        occurrenceDate: '2026-03-29',
      })
      expect(result).toEqual({ data: { id: 99 } })
    })

    it('returns duplicate-day error for unique index collisions', async () => {
      getReminderByIdMock.mockResolvedValue({ id: 20 })
      createReminderCheckMock.mockResolvedValue(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed')
      )

      const result = await services.checkReminderOccurrence(20, 5, '2026-03-29')

      expect(getReminderByIdMock).toHaveBeenCalledWith(20, 5)
      expect(result.error).toBe('Reminder occurrence is already checked for this day')
    })
  })

  describe('processReminderTrigger', () => {
    it('updates last and next trigger dates', async () => {
      const triggeredAt = new Date('2026-03-29T09:00:00.000Z')
      const nextTriggerAt = new Date('2026-03-30T09:00:00.000Z')
      getReminderByIdMock.mockResolvedValue({
        id: 7,
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        weekDays: null,
        monthDays: null,
      })
      computeNextTriggerAtMock.mockReturnValue(nextTriggerAt)
      getOccurrenceDateKeyMock.mockReturnValue('2026-03-29')
      updateReminderMock.mockResolvedValue(undefined)

      const result = await services.processReminderTrigger(7, triggeredAt)

      expect(getReminderByIdMock).toHaveBeenCalledWith(7)
      expect(updateReminderMock).toHaveBeenCalledWith(7, {
        lastTriggeredAt: triggeredAt,
        nextTriggerAt,
      })
      expect(result).toEqual({
        data: {
          reminderId: 7,
          occurrenceDate: '2026-03-29',
          lastTriggeredAt: triggeredAt,
          nextTriggerAt,
        },
      })
    })
  })
})
