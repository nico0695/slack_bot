export interface IBridgeConfig {
  baseUrl: string | null
  enabled: boolean
  secret: string | null
}

export interface IBridgeConfigUpdate {
  baseUrl?: string | null
  secret?: string | null
  enabled?: boolean
}

// Public shape: the secret is never returned, only whether it is set
export interface IBridgeConfigResponse {
  baseUrl: string | null
  enabled: boolean
  secretConfigured: boolean
}

// Alert data needed to build a bridge event (an IAlertToNotify matches it)
export interface IBridgeAlert {
  id?: number
  message: string
  date: Date
  requestId?: string | null
  deviceId?: string | null
  user: {
    id: number
    bridgeBaseUrl?: string | null
    bridgeWebhookEnabled?: boolean
  }
}

// Webhook body, field names as defined in the bridge contract
export interface IBridgeAlertEventPayload {
  version: number
  event_id: string
  type: string
  alert_id: number
  scheduled_at: string
  triggered_at: string
  message: string
  request_id?: string
  device_id?: string
}

export interface IBridgeDeliveryCreate {
  eventId: string
  alertId: number
  userId: number
  occurrenceAt: Date
  payload: IBridgeAlertEventPayload
  nextAttemptAt: Date
}
