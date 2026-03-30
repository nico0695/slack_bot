import { injectable } from 'tsyringe'

import { Reminders } from '../../../entities/reminders'
import { ReminderChecks } from '../../../entities/reminderChecks'
import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'
import { Profiles } from '../../../shared/constants/auth.constants'

import RemindersDataSource from '../repositories/database/reminders.dataSource'
import ReminderChecksDataSource from '../repositories/database/reminderChecks.dataSource'
import { ReminderStatus } from '../shared/constants/reminders.constants'
import {
  IReminderAccessContext,
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

  private isAdmin(actor: IReminderAccessContext): boolean {
    return actor.profile === Profiles.ADMIN
  }

  private async getManagedReminder(
    reminderId: number,
    actor: IReminderAccessContext
  ): Promise<Reminders | null | Error> {
    return await this.remindersDataSource.getReminderById(
      reminderId,
      this.isAdmin(actor) ? undefined : actor.userId
    )
  }

  private canCheckReminder(reminder: Reminders, actor: IReminderAccessContext): boolean {
    if (this.isAdmin(actor)) {
      return true
    }

    if (reminder.channelId) {
      return true
    }

    return reminder.user?.id === actor.userId
  }

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
    actor: IReminderAccessContext
  ): Promise<GenericResponse<Reminders>> {
    try {
      const response = await this.getManagedReminder(reminderId, actor)

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
      log.error({ err: error, reminderId, userId: actor.userId }, 'getReminderById failed')
      return {
        error: 'Failed to get reminder',
      }
    }
  }

  public async pauseReminder(
    reminderId: number,
    actor: IReminderAccessContext
  ): Promise<GenericResponse<Reminders>> {
    try {
      const reminderResponse = await this.getManagedReminder(reminderId, actor)
      if (reminderResponse instanceof Error) {
        throw reminderResponse
      }

      if (!reminderResponse) {
        return {
          error: 'Reminder not found',
        }
      }

      await this.remindersDataSource.updateReminder(reminderId, { status: ReminderStatus.PAUSED })

      const refreshedReminder = await this.getManagedReminder(reminderId, actor)
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
      log.error({ err: error, reminderId, userId: actor.userId }, 'pauseReminder failed')
      return {
        error: 'Failed to pause reminder',
      }
    }
  }

  public async resumeReminder(
    reminderId: number,
    actor: IReminderAccessContext
  ): Promise<GenericResponse<Reminders>> {
    try {
      const reminderResponse = await this.getManagedReminder(reminderId, actor)
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

      const refreshedReminder = await this.getManagedReminder(reminderId, actor)
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
      log.error({ err: error, reminderId, userId: actor.userId }, 'resumeReminder failed')
      return {
        error: 'Failed to resume reminder',
      }
    }
  }

  public async deleteReminder(
    reminderId: number,
    actor: IReminderAccessContext
  ): Promise<GenericResponse<boolean>> {
    try {
      const reminder = await this.getManagedReminder(reminderId, actor)
      if (reminder instanceof Error) {
        throw reminder
      }

      if (!reminder) {
        return {
          error: 'Reminder not found',
        }
      }

      await this.reminderChecksDataSource.deleteReminderChecksByReminder(reminderId)

      const deletedRows = await this.remindersDataSource.deleteReminder(
        reminderId,
        this.isAdmin(actor) ? undefined : actor.userId
      )

      log.info({ reminderId, userId: actor.userId }, 'Reminder deleted')

      return {
        data: deletedRows > 0,
      }
    } catch (error) {
      log.error({ err: error, reminderId, userId: actor.userId }, 'deleteReminder failed')
      return {
        error: 'Failed to delete reminder',
      }
    }
  }

  public async checkReminderOccurrence(
    reminderId: number,
    actor: IReminderAccessContext
  ): Promise<GenericResponse<ReminderChecks>> {
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

      if (!this.canCheckReminder(reminder, actor)) {
        return {
          error: 'Reminder not found',
        }
      }

      const resolvedOccurrenceDate = getOccurrenceDateKey(new Date())
      const existingCheck = await this.reminderChecksDataSource.getReminderCheckByOccurrence(
        reminderId,
        resolvedOccurrenceDate
      )

      if (existingCheck instanceof Error) {
        throw existingCheck
      }

      if (existingCheck) {
        return {
          data: existingCheck,
        }
      }

      const response = await this.reminderChecksDataSource.createReminderCheck({
        reminderId,
        checkedByUserId: actor.userId,
        occurrenceDate: resolvedOccurrenceDate,
      })

      if (response instanceof Error) {
        if (response.message.includes('UNIQUE constraint failed')) {
          const duplicatedCheck = await this.reminderChecksDataSource.getReminderCheckByOccurrence(
            reminderId,
            resolvedOccurrenceDate
          )

          if (duplicatedCheck instanceof Error) {
            throw duplicatedCheck
          }

          if (duplicatedCheck) {
            return {
              data: duplicatedCheck,
            }
          }
        }

        throw response
      }

      return {
        data: response,
      }
    } catch (error) {
      log.error(
        { err: error, reminderId, checkedByUserId: actor.userId },
        'checkReminderOccurrence failed'
      )
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

  public async refreshReminderSchedule(
    reminderId: number,
    fromDate: Date = new Date()
  ): Promise<GenericResponse<Reminders>> {
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
        fromDate
      )

      await this.remindersDataSource.updateReminder(reminderId, {
        nextTriggerAt,
      })

      const refreshedReminder = await this.remindersDataSource.getReminderById(reminderId)
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
      log.error({ err: error, reminderId }, 'refreshReminderSchedule failed')
      return {
        error: 'Failed to refresh reminder schedule',
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
