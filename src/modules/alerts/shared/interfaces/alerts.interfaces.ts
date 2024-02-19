import { PushSubscription } from 'web-push'

export interface IAlerts {
  id?: number
  message: string
  date: Date
  userId: number
}

export interface IAlertToNotify extends IAlerts {
  user: {
    id: number
    username: string
    email: string
    slackId: string
    slackChannelId: string

    pwSubscription?: PushSubscription // Web push subscription
  }
}
