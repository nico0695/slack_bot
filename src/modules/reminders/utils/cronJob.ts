import { container } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import { connectionSlackApp as slackApp } from '../../../config/slackConfig'

import ReminderChecksDataSource from '../repositories/database/reminderChecks.dataSource'
import RemindersServices from '../services/reminders.services'
import { ReminderStatus } from '../shared/constants/reminders.constants'
import {
  getOccurrenceDateKey,
  isBeforeScheduledTime,
} from '../shared/utils/remindersSchedule.utils'

const log = createModuleLogger('reminders.cron')

export const reminderCronJob = async (): Promise<void> => {
  try {
    const startTime = Date.now()
    const now = new Date()
    const remindersServices = container.resolve(RemindersServices)
    const reminderChecksDataSource = container.resolve(ReminderChecksDataSource)

    const remindersResponse = await remindersServices.getDueReminders(now)

    if (remindersResponse.error) {
      log.error({ error: remindersResponse.error }, 'Failed to get due reminders')
      return
    }

    const dueReminders = remindersResponse.data.filter(
      (reminder) => reminder.status === ReminderStatus.ACTIVE
    )

    if (dueReminders.length === 0) {
      return
    }

    const occurrenceDate = getOccurrenceDateKey(now)

    await Promise.all(
      dueReminders.map(async (reminder) => {
        if (isBeforeScheduledTime(now, reminder.timeOfDay)) {
          const refreshResponse = await remindersServices.refreshReminderSchedule(reminder.id, now)

          if (refreshResponse.error) {
            log.error(
              { reminderId: reminder.id, error: refreshResponse.error },
              'Failed to refresh reminder schedule'
            )
          }

          return
        }

        const reminderCheck = await reminderChecksDataSource.getReminderCheckByOccurrence(
          reminder.id,
          occurrenceDate
        )

        if (reminderCheck instanceof Error) {
          log.error({ err: reminderCheck, reminderId: reminder.id }, 'Failed to get reminder check')
          return
        }

        if (!reminderCheck) {
          const targetChannel = reminder.channelId ?? reminder.user?.slackChannelId

          if (targetChannel) {
            try {
              await slackApp.client.chat.postMessage({
                channel: targetChannel,
                text: `Reminder: ${reminder.message}`,
              })
            } catch (error) {
              log.error(
                { err: error, reminderId: reminder.id },
                'Failed to send reminder notification'
              )
            }
          } else {
            log.warn({ reminderId: reminder.id }, 'Reminder has no delivery target')
          }
        }

        const processResponse = await remindersServices.processReminderTrigger(reminder.id, now)

        if (processResponse.error) {
          log.error(
            { reminderId: reminder.id, error: processResponse.error },
            'Failed to process reminder trigger'
          )
        }
      })
    )

    const durationMs = Date.now() - startTime
    log.info({ count: dueReminders.length, durationMs }, 'Reminders processed successfully')
  } catch (error) {
    log.error({ err: error }, 'reminderCronJob failed')
  }
}
