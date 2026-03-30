import { injectable } from 'tsyringe'

import { Reminders } from '../../../entities/reminders'
import { ReminderChecks } from '../../../entities/reminderChecks'
import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'

import RemindersDataSource from '../repositories/database/reminders.dataSource'
import ReminderChecksDataSource from '../repositories/database/reminderChecks.dataSource'
import { ReminderStatus } from '../shared/constants/reminders.constants'
import {
  IReminder,
  IReminderScopeFilter,
  IReminderTriggerResult,
} from '../shared/interfaces/reminders.interfaces'
import {
  computeNextTriggerAt,
  getOccurrenceDateKey,
  validateRecurrenceConfig,
} from '../shared/utils/remindersSchedule.utils'

const log = createModuleLogger('reminders.service')

@injectable()
export default class RemindersServices {
  constructor(
    private remindersDataSource: RemindersDataSource,
    private reminderChecksDataSource: ReminderChecksDataSource
  ) {}

  public async createReminder(data: IReminder): Promise<GenericResponse<Reminders>> {
    try {
      const recurrenceValidation = validateRecurrenceConfig(data)
      if (!recurrenceValidation.isValid) {
        return {
          error: recurrenceValidation.error ?? 'Invalid reminder recurrence config',
        }
      }

      const nextTriggerAt = data.nextTriggerAt ?? computeNextTriggerAt(data, new Date())
      const response = await this.remindersDataSource.createReminder({
        ...data,
        status: data.status ?? ReminderStatus.ACTIVE,
        nextTriggerAt,
      })

      if (response instanceof Error) {
        throw response
      }

      log.info({ userId: data.userId, reminderId: response.id }, 'Reminder created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'createReminder failed')
      return {
        error: 'Failed to create reminder',
      }
    }
  }

  public async getRemindersByScope(
    userId: number,
    options: IReminderScopeFilter = {}
  ): Promise<GenericResponse<Reminders[]>> {
    try {
      const response = await this.remindersDataSource.getRemindersByScope(userId, options)

      if (response instanceof Error) {
        throw response
      }

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'getRemindersByScope failed')
      return {
        error: 'Failed to get reminders',
      }
    }
  }

  public async getReminderById(
    reminderId: number,
    userId: number
  ): Promise<GenericResponse<Reminders>> {
    try {
      const response = await this.remindersDataSource.getReminderById(reminderId, userId)

      if (response instanceof Error) {
        throw response
      }

      if (!response) {
        return {
          error: 'Reminder not found',
        }
      }

      return { data: response }
    } catch (error) {
      log.error({ err: error, reminderId, userId }, 'getReminderById failed')
      return {
        error: 'Failed to get reminder',
      }
    }
  }

  public async pauseReminder(
    reminderId: number,
    userId: number
  ): Promise<GenericResponse<Reminders>> {
    try {
      const reminderResponse = await this.remindersDataSource.getReminderById(reminderId, userId)
      if (reminderResponse instanceof Error) {
        throw reminderResponse
      }

      if (!reminderResponse) {
        return {
          error: 'Reminder not found',
        }
      }

      await this.remindersDataSource.updateReminder(reminderId, { status: ReminderStatus.PAUSED })

      const refreshedReminder = await this.remindersDataSource.getReminderById(reminderId, userId)
      if (refreshedReminder instanceof Error) {
        throw refreshedReminder
      }

      if (!refreshedReminder) {
        return {
          error: 'Reminder not found',
        }
      }

      return {
        data: refreshedReminder,
      }
    } catch (error) {
      log.error({ err: error, reminderId, userId }, 'pauseReminder failed')
      return {
        error: 'Failed to pause reminder',
      }
    }
  }

  public async resumeReminder(
    reminderId: number,
    userId: number
  ): Promise<GenericResponse<Reminders>> {
    try {
      const reminderResponse = await this.remindersDataSource.getReminderById(reminderId, userId)
      if (reminderResponse instanceof Error) {
        throw reminderResponse
      }

      if (!reminderResponse) {
        return {
          error: 'Reminder not found',
        }
      }

      const nextTriggerAt = computeNextTriggerAt(
        {
          recurrenceType: reminderResponse.recurrenceType as any,
          timeOfDay: reminderResponse.timeOfDay,
          weekDays: reminderResponse.weekDays as any,
          monthDays: reminderResponse.monthDays,
        },
        new Date()
      )

      await this.remindersDataSource.updateReminder(reminderId, {
        status: ReminderStatus.ACTIVE,
        nextTriggerAt,
      })

      const refreshedReminder = await this.remindersDataSource.getReminderById(reminderId, userId)
      if (refreshedReminder instanceof Error) {
        throw refreshedReminder
      }

      if (!refreshedReminder) {
        return {
          error: 'Reminder not found',
        }
      }

      return {
        data: refreshedReminder,
      }
    } catch (error) {
      log.error({ err: error, reminderId, userId }, 'resumeReminder failed')
      return {
        error: 'Failed to resume reminder',
      }
    }
  }

  public async deleteReminder(
    reminderId: number,
    userId: number
  ): Promise<GenericResponse<boolean>> {
    try {
      const deletedRows = await this.remindersDataSource.deleteReminder(reminderId, userId)

      log.info({ reminderId, userId }, 'Reminder deleted')

      return {
        data: deletedRows > 0,
      }
    } catch (error) {
      log.error({ err: error, reminderId, userId }, 'deleteReminder failed')
      return {
        error: 'Failed to delete reminder',
      }
    }
  }

  public async checkReminderOccurrence(
    reminderId: number,
    checkedByUserId: number,
    occurrenceDate?: string
  ): Promise<GenericResponse<ReminderChecks>> {
    try {
      const reminder = await this.remindersDataSource.getReminderById(reminderId, checkedByUserId)
      if (reminder instanceof Error) {
        throw reminder
      }

      if (!reminder) {
        return {
          error: 'Reminder not found',
        }
      }

      const resolvedOccurrenceDate = occurrenceDate ?? getOccurrenceDateKey(new Date())
      const response = await this.reminderChecksDataSource.createReminderCheck({
        reminderId,
        checkedByUserId,
        occurrenceDate: resolvedOccurrenceDate,
      })

      if (response instanceof Error) {
        if (response.message.includes('UNIQUE constraint failed')) {
          return {
            error: 'Reminder occurrence is already checked for this day',
          }
        }

        throw response
      }

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, reminderId, checkedByUserId }, 'checkReminderOccurrence failed')
      return {
        error: 'Failed to check reminder occurrence',
      }
    }
  }

  public async getDueReminders(date: Date = new Date()): Promise<GenericResponse<Reminders[]>> {
    try {
      const response = await this.remindersDataSource.getDueReminders(date)

      if (response instanceof Error) {
        throw response
      }

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error }, 'getDueReminders failed')
      return {
        error: 'Failed to get due reminders',
      }
    }
  }

  public async processReminderTrigger(
    reminderId: number,
    triggeredAt: Date = new Date()
  ): Promise<GenericResponse<IReminderTriggerResult>> {
    try {
      const reminder = await this.remindersDataSource.getReminderById(reminderId)
      if (reminder instanceof Error) {
        throw reminder
      }

      if (!reminder) {
        return {
          error: 'Reminder not found',
        }
      }

      const nextTriggerAt = computeNextTriggerAt(
        {
          recurrenceType: reminder.recurrenceType as any,
          timeOfDay: reminder.timeOfDay,
          weekDays: reminder.weekDays as any,
          monthDays: reminder.monthDays,
        },
        triggeredAt
      )

      await this.remindersDataSource.updateReminder(reminderId, {
        lastTriggeredAt: triggeredAt,
        nextTriggerAt,
      })

      return {
        data: {
          reminderId,
          occurrenceDate: getOccurrenceDateKey(triggeredAt),
          lastTriggeredAt: triggeredAt,
          nextTriggerAt,
        },
      }
    } catch (error) {
      log.error({ err: error, reminderId }, 'processReminderTrigger failed')
      return {
        error: 'Failed to process reminder trigger',
      }
    }
  }
}
