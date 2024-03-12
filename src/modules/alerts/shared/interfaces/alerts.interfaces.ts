import { PushSubscription } from 'web-push'

export interface IAlert {
  id?: number
  message: string
  date: Date
  userId: number

  sent?: boolean
}

export interface IAlertToNotify extends IAlert {
  user: {
    id: number
    username: string
    email: string
    slackId: string
    slackChannelId: string

    pwSubscription?: PushSubscription // Web push subscription
  }
}
