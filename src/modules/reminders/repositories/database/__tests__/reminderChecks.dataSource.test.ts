import { ReminderChecks } from '../../../../../entities/reminderChecks'
import ReminderChecksDataSource from '../reminderChecks.dataSource'

describe('ReminderChecksDataSource', () => {
  const dataSource = new ReminderChecksDataSource()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createReminderCheck', () => {
    it('saves reminder check for reminder occurrence', async () => {
      jest
        .spyOn(ReminderChecks.prototype as any, 'save')
        .mockImplementation(async function (this: ReminderChecks) {
          return this
        })

      const checkedAt = new Date('2026-03-29T14:00:00.000Z')
      const result = await dataSource.createReminderCheck({
        reminderId: 40,
        occurrenceDate: '2026-03-29',
        checkedByUserId: 12,
        checkedAt,
      })

      expect(result).toBeInstanceOf(ReminderChecks)
      expect((result as ReminderChecks).reminder.id).toBe(40)
      expect((result as ReminderChecks).occurrenceDate).toBe('2026-03-29')
      expect((result as ReminderChecks).checkedByUserId).toBe(12)
      expect((result as ReminderChecks).checkedAt).toEqual(checkedAt)
    })

    it('returns error when save fails', async () => {
      const error = new Error('constraint')
      jest.spyOn(ReminderChecks.prototype as any, 'save').mockRejectedValue(error)

      const result = await dataSource.createReminderCheck({
        reminderId: 40,
        occurrenceDate: '2026-03-29',
        checkedByUserId: 12,
      })

      expect(result).toBe(error)
    })
  })

  it('finds reminder check by reminder and occurrence date', async () => {
    const reminderCheck = { id: 1 } as any
    const findOneSpy = jest.spyOn(ReminderChecks, 'findOne').mockResolvedValue(reminderCheck)

    const result = await dataSource.getReminderCheckByOccurrence(40, '2026-03-29')

    expect(findOneSpy).toHaveBeenCalledWith({
      where: {
        reminder: { id: 40 },
        occurrenceDate: '2026-03-29',
      },
    })
    expect(result).toBe(reminderCheck)
  })

  it('returns empty array when reminder ids list is empty', async () => {
    const result = await dataSource.getReminderChecksByOccurrenceDate([], '2026-03-29')

    expect(result).toEqual([])
  })

  describe('deleteReminderChecksByReminder', () => {
    it('returns affected rows count', async () => {
      jest.spyOn(ReminderChecks, 'delete').mockResolvedValue({ affected: 2 } as any)

      const result = await dataSource.deleteReminderChecksByReminder(55)

      expect(ReminderChecks.delete).toHaveBeenCalledWith({
        reminder: { id: 55 },
      })
      expect(result).toBe(2)
    })
  })
})
