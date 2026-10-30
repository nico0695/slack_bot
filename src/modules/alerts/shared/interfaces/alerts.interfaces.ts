import { PushSubscription } from 'web-push'

import { Alerts } from '../../../../entities/alerts'
import { GenericResponse } from '../../../../shared/interfaces/services'

export interface IAlert {
  id?: number
  message: string
  date: Date
  userId: number
  channelId?: string | null

  requestId?: string | null
  source?: string | null
  deviceId?: string | null

  sent?: boolean
}

export interface IAlertToNotify extends IAlert {
  user: {
    id: number
    username: string
    email: string
    slackId: string
    slackChannelId: string
    bridgeBaseUrl?: string | null
    bridgeWebhookEnabled?: boolean

    pwSubscription?: PushSubscription // Web push subscription
  }
}

export interface ICreateAlertResponse extends GenericResponse<Alerts> {
  // Set when the requestId was already used with different data
  conflictAlertId?: number
}

export type TSnoozeAlertResult =
  | { status: 'snoozed'; alertId: number; scheduledAt: Date }
  | { status: 'not_found' }
  // The alert date no longer matches the expected one
  | { status: 'schedule_changed' }
