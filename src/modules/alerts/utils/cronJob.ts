import webpush from 'web-push'
import { container } from 'tsyringe'

import { createModuleLogger } from '../../../config/logger'
import { connectionSlackApp as slackApp } from '../../../config/slackConfig'
import AlertsServices from '../services/alerts.services'
import BridgeServices from '../../bridge/services/bridge.services'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'

const log = createModuleLogger('alerts.cron')

// Prevents overlapping runs when a tick takes longer than the schedule interval
let isRunning = false

/**
 * Get alerts to notify, enqueue their bridge events and send message to slack
 */
export const alertCronJob = async (): Promise<void> => {
  if (isRunning) {
    log.warn('Previous alertCronJob still running, skipping tick')
    return
  }

  isRunning = true

  try {
    const startTime = Date.now()
    const now = new Date()
    const alertsServices = container.resolve(AlertsServices)
    const bridgeServices = container.resolve(BridgeServices)

    const alerts = await alertsServices.getAlertsToNotify()

    if (alerts.error) {
      log.error('Failed to get alerts to notify')
      return
    }

    if (alerts?.data.length === 0) {
      return
    }

    const processedAlerts = await Promise.all(
      alerts?.data.map(async (alert) => {
        // Enqueue first: if it fails the alert stays unsent and the whole alert is retried
        // next tick, so the bridge event is never lost and Slack/Web Push are not repeated
        const bridgeResponse = await bridgeServices.enqueueAlertEvent(alert, now)

        if (bridgeResponse.error) {
          log.error({ alertId: alert.id }, 'Skipping alert, bridge event could not be enqueued')
          return null
        }

        const targetChannel = alert.channelId ?? alert.user.slackChannelId

        if (targetChannel) {
          // Send rich message to slack
          const messageBlock = slackMsgUtils.msgAlertDetail(alert as any)

          try {
            await slackApp.client.chat.postMessage({
              channel: targetChannel,
              text: `🔔 Alerta: ${alert.message}`,
              blocks: messageBlock.blocks,
            })
          } catch (error) {
            log.error({ err: error, alertId: alert.id }, 'Failed to send slack notification')
          }

          // Send notification to web
          if (alert.user.pwSubscription) {
            try {
              await webpush.sendNotification(
                alert.user.pwSubscription,
                JSON.stringify({
                  title: alert.message,
                  body: alert.message,
                  url: 'https://localhost:3000/',
                  tag: `new-alert-${alert.id}`,
                })
              )
            } catch (error) {
              log.error({ err: error }, 'Failed to send web notification')
            }
          }
        }

        return { id: alert.id, date: alert.date }
      })
    )

    const notified = processedAlerts.filter((item) => item !== null)

    if (notified.length > 0) {
      // Conditional on the date read here, so a snooze made meanwhile is not lost
      await alertsServices.updateAlertAsNotified(notified)
    }

    const durationMs = Date.now() - startTime
    log.info(
      { count: notified.length, skipped: alerts.data.length - notified.length, durationMs },
      'Alerts notified successfully'
    )
  } catch (error) {
    log.error({ err: error }, 'alertCronJob failed')
  } finally {
    isRunning = false
  }
}
