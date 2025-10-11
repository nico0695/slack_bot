import webpush from 'web-push'

import { connectionSlackApp } from '../../../config/slackConfig'
import AlertsServices from '../services/alerts.services'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'

/**
 * Get alerts to notify and send message to slack
 */
export const alertCronJob = async (): Promise<void> => {
  try {
    const alertsServices = AlertsServices.getInstance()
    const slackApp = connectionSlackApp

    const alerts = await alertsServices.getAlertsToNotify()

    if (alerts.error) {
      console.log('Error getting alerts to notify')
      return
    }

    if (alerts?.data.length === 0) {
      return
    }

    alerts?.data.forEach(async (alert) => {
      const targetChannel = alert.channelId ?? alert.user.slackChannelId

      if (targetChannel) {
        // Send rich message to slack
        const messageBlock = slackMsgUtils.msgAlertDetail(alert as any)

        // Send rich message to slack
        await slackApp.client.chat.postMessage({
          channel: targetChannel,
          text: `🔔 Alerta: ${alert.message}`,
          blocks: messageBlock.blocks,
        })

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
            console.log('Error sending web notification= ', error)
          }
        }
      }
    })

    await alertsServices.updateAlertAsNotified(alerts?.data.map((alert) => alert.id))

    console.log(`${alerts?.data.length} alert/s notified successfully 🚀`)
  } catch (error) {
    console.log('Error in alertCronJob= ', error)
  }
}
