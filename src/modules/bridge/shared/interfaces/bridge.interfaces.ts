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

// Result of a webhook POST: an HTTP status, or an error code when no response arrived
export interface IBridgeWebhookResult {
  status?: number
  retryAfter?: string
  errorCode?: string
}

export type BridgeDeliveryOutcome = 'delivered' | 'retry' | 'failed'

export interface IBridgeDeliveryResult {
  outcome: BridgeDeliveryOutcome
  lastStatusCode: number | null
  lastError: string | null
  retryAfterMs?: number
}

export interface IBridgeDeliveryUpdate {
  status: string
  attempts?: number
  nextAttemptAt?: Date
  lockedUntil: Date | null
  lastStatusCode?: number | null
  lastError?: string | null
  deliveredAt?: Date | null
}
