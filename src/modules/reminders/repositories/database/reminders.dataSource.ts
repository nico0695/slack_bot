import { FindOptionsWhere, IsNull, LessThanOrEqual } from 'typeorm'
import { singleton } from 'tsyringe'

import { Reminders } from '../../../../entities/reminders'
import { Users } from '../../../../entities/users'

import { ReminderScope, ReminderStatus } from '../../shared/constants/reminders.constants'
import { IReminder, IReminderScopeFilter } from '../../shared/interfaces/reminders.interfaces'

@singleton()
export default class RemindersDataSource {
  constructor() {}

  async createReminder(data: IReminder): Promise<Reminders | Error> {
    try {
      const user = new Users()
      user.id = data.userId

      const reminder = new Reminders()

      reminder.message = data.message
      reminder.recurrenceType = data.recurrenceType
      reminder.timeOfDay = data.timeOfDay
      reminder.weekDays = data.weekDays?.length ? data.weekDays : null
      reminder.monthDays = data.monthDays?.length ? data.monthDays : null
      reminder.status = data.status ?? ReminderStatus.ACTIVE
      reminder.nextTriggerAt = data.nextTriggerAt ?? new Date()
      reminder.lastTriggeredAt = data.lastTriggeredAt ?? null
      reminder.user = user
      reminder.channelId = data.channelId ?? null

      await reminder.save()

      return reminder
    } catch (error) {
      return error as Error
    }
  }

  async getRemindersByScope(
    userId: number,
    options: IReminderScopeFilter = {}
  ): Promise<Reminders[] | Error> {
    try {
      const where: FindOptionsWhere<Reminders> = {}
      const rawChannelId = options.channelId

      if (
        options.scope === ReminderScope.CHANNEL ||
        (typeof rawChannelId === 'string' && rawChannelId.trim().length > 0)
      ) {
        where.channelId = typeof rawChannelId === 'string' ? rawChannelId.trim() : ''
      } else {
        where.user = { id: userId }
        if (options.scope === ReminderScope.PERSONAL || rawChannelId === null) {
          where.channelId = IsNull()
        }
      }

      if (options.status) {
        where.status = options.status
      }

      const reminders = await Reminders.find({
        where,
        order: {
          nextTriggerAt: 'ASC',
        },
      })

      return reminders
    } catch (error) {
      return error as Error
    }
  }

  async getReminderById(reminderId: number, userId?: number): Promise<Reminders | null | Error> {
    try {
      const where: FindOptionsWhere<Reminders> = { id: reminderId }

      if (userId) {
        where.user = { id: userId }
      }

      const reminder = await Reminders.findOne({
        where,
        relations: ['user'],
      })

      return reminder
    } catch (error) {
      return error as Error
    }
  }

  async updateReminder(reminderId: number, dataUpdate: Partial<IReminder>): Promise<void> {
    try {
      const data = { ...dataUpdate }
      delete data.userId
      delete data.id

      await Reminders.update(reminderId, data)
    } catch (error) {
      throw new Error('Failed to update reminder')
    }
  }

  async getDueReminders(date: Date): Promise<Reminders[] | Error> {
    try {
      const reminders = await Reminders.find({
        where: {
          status: ReminderStatus.ACTIVE,
          nextTriggerAt: LessThanOrEqual(date),
        },
        relations: ['user'],
        order: {
          nextTriggerAt: 'ASC',
        },
      })

      return reminders
    } catch (error) {
      return error as Error
    }
  }

  async deleteReminder(reminderId: number, userId: number): Promise<number> {
    try {
      const result = await Reminders.delete({
        id: reminderId,
        user: { id: userId },
      })
      return result.affected ?? 0
    } catch (error) {
      throw new Error(error as string)
    }
  }
}
