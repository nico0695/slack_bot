import { In } from 'typeorm'
import { singleton } from 'tsyringe'

import { ReminderChecks } from '../../../../entities/reminderChecks'
import { Reminders } from '../../../../entities/reminders'

import { IReminderCheck } from '../../shared/interfaces/reminders.interfaces'

@singleton()
export default class ReminderChecksDataSource {
  constructor() {}

  async createReminderCheck(data: IReminderCheck): Promise<ReminderChecks | Error> {
    try {
      const reminder = new Reminders()
      reminder.id = data.reminderId

      const reminderCheck = new ReminderChecks()

      reminderCheck.reminder = reminder
      reminderCheck.occurrenceDate = data.occurrenceDate
      reminderCheck.checkedByUserId = data.checkedByUserId
      reminderCheck.checkedAt = data.checkedAt ?? new Date()

      await reminderCheck.save()

      return reminderCheck
    } catch (error) {
      return error as Error
    }
  }

  async getReminderCheckByOccurrence(
    reminderId: number,
    occurrenceDate: string
  ): Promise<ReminderChecks | null | Error> {
    try {
      const reminderCheck = await ReminderChecks.findOne({
        where: {
          reminder: { id: reminderId },
          occurrenceDate,
        },
      })

      return reminderCheck
    } catch (error) {
      return error as Error
    }
  }

  async getReminderChecksByOccurrenceDate(
    reminderIds: number[],
    occurrenceDate: string
  ): Promise<ReminderChecks[] | Error> {
    try {
      if (reminderIds.length === 0) {
        return []
      }

      const reminderChecks = await ReminderChecks.find({
        where: {
          reminder: { id: In(reminderIds) },
          occurrenceDate,
        },
      })

      return reminderChecks
    } catch (error) {
      return error as Error
    }
  }

  async deleteReminderChecksByReminder(reminderId: number): Promise<number> {
    try {
      const result = await ReminderChecks.delete({
        reminder: { id: reminderId },
      })

      return result.affected ?? 0
    } catch (error) {
      throw new Error(error as string)
    }
  }
}
