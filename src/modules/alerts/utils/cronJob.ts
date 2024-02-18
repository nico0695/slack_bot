import { connectionSlackApp } from '../../../config/slackConfig'
import AlertsServices from '../services/alerts.services'

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
      console.log('No alerts to notify')
      return
    }

    alerts?.data.forEach(async (alert) => {
      if (alert.user.slackChannelId) {
        await slackApp.client.chat.postMessage({
          channel: alert.user.slackChannelId,
          text: `💬 ${alert.message}`,
        })
      }
    })

    await alertsServices.updateAlertAsNotified(alerts?.data.map((alert) => alert.id))

    console.log(`${alerts?.data.length} lerts notified successfully 🚀`)
  } catch (error) {}
}
