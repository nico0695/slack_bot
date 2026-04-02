import { Reminders } from '../../../../../entities/reminders'
import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
  ReminderWeekDay,
} from '../../../shared/constants/reminders.constants'
import RemindersDataSource from '../reminders.dataSource'

describe('RemindersDataSource', () => {
  const dataSource = new RemindersDataSource()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createReminder', () => {
    it('saves a reminder with recurrence and trigger data', async () => {
      jest
        .spyOn(Reminders.prototype as any, 'save')
        .mockImplementation(async function (this: Reminders) {
          return this
        })

      const nextTriggerAt = new Date('2026-03-30T09:00:00.000Z')
      const result = await dataSource.createReminder({
        userId: 11,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '09:00',
        weekDays: [ReminderWeekDay.MONDAY, ReminderWeekDay.WEDNESDAY],
        status: ReminderStatus.ACTIVE,
        nextTriggerAt,
      })

      expect(result).toBeInstanceOf(Reminders)
      expect((result as Reminders).user.id).toBe(11)
      expect((result as Reminders).message).toBe('Drink water')
      expect((result as Reminders).nextTriggerAt).toEqual(nextTriggerAt)
    })

    it('returns error when save fails', async () => {
      const error = new Error('db fail')
      jest.spyOn(Reminders.prototype as any, 'save').mockRejectedValue(error)

      const result = await dataSource.createReminder({
        userId: 11,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
      })

      expect(result).toBe(error)
    })
  })

  it('retrieves reminders by channel scope', async () => {
    const reminders = [{ id: 1 }] as any
    const findSpy = jest.spyOn(Reminders, 'find').mockResolvedValue(reminders)

    const result = await dataSource.getRemindersByScope(10, {
      scope: ReminderScope.CHANNEL,
      channelId: 'C123',
      status: ReminderStatus.ACTIVE,
    })

    expect(findSpy).toHaveBeenCalledWith({
      where: {
        channelId: 'C123',
        status: ReminderStatus.ACTIVE,
      },
      order: {
        nextTriggerAt: 'ASC',
      },
    })
    expect(result).toBe(reminders)
  })

  it('gets a reminder by id and user with relation', async () => {
    const reminder = { id: 22 } as any
    const findOneSpy = jest.spyOn(Reminders, 'findOne').mockResolvedValue(reminder)

    const result = await dataSource.getReminderById(22, 8)

    expect(findOneSpy).toHaveBeenCalledWith({
      where: { id: 22, user: { id: 8 } },
      relations: ['user'],
    })
    expect(result).toBe(reminder)
  })

  it('updates reminder with sanitized payload', async () => {
    const updateSpy = jest.spyOn(Reminders, 'update').mockResolvedValue({} as any)

    await dataSource.updateReminder(4, {
      id: 4,
      userId: 9,
      message: 'Updated message',
      status: ReminderStatus.PAUSED,
    })

    expect(updateSpy).toHaveBeenCalledWith(4, {
      message: 'Updated message',
      status: ReminderStatus.PAUSED,
    })
  })

  it('gets due reminders with active status filter', async () => {
    const reminders = [{ id: 99 }] as any
    const findSpy = jest.spyOn(Reminders, 'find').mockResolvedValue(reminders)
    const now = new Date('2026-03-29T12:00:00.000Z')

    const result = await dataSource.getDueReminders(now)
    const args = findSpy.mock.calls[0][0] as any

    expect(args.where.status).toBe(ReminderStatus.ACTIVE)
    expect(args.relations).toEqual(['user'])
    expect(result).toBe(reminders)
  })

  describe('deleteReminder', () => {
    it('returns affected rows', async () => {
      jest.spyOn(Reminders, 'delete').mockResolvedValue({ affected: 1 } as any)

      const result = await dataSource.deleteReminder(7, 3)

      expect(Reminders.delete).toHaveBeenCalledWith({
        id: 7,
        user: { id: 3 },
      })
      expect(result).toBe(1)
    })

    it('returns zero when nothing is deleted', async () => {
      jest.spyOn(Reminders, 'delete').mockResolvedValue({ affected: undefined } as any)

      const result = await dataSource.deleteReminder(7, 3)

      expect(result).toBe(0)
    })
  })
})
