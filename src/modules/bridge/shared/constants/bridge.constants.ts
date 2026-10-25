export const BRIDGE_URL_MAX_LENGTH = 2048
export const BRIDGE_SECRET_MIN_LENGTH = 32
export const BRIDGE_SECRET_MAX_LENGTH = 256

// Hostnames that always point to local or internal networks
export const BRIDGE_BLOCKED_HOSTNAMES = ['localhost']
export const BRIDGE_BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal']

export enum BridgeDeliveryStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export const BRIDGE_EVENT_VERSION = 1
export const BRIDGE_EVENT_ALERT_TRIGGERED = 'alert.triggered'

// Webhook delivery
export const BRIDGE_WEBHOOK_PATH = 'webhooks/alerts'
export const BRIDGE_WEBHOOK_SECRET_HEADER = 'X-Bridge-Webhook-Secret'
export const BRIDGE_WEBHOOK_TIMEOUT_MS = 5000
export const BRIDGE_WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024

export const BRIDGE_DELIVERY_BATCH_SIZE = 20
export const BRIDGE_DELIVERY_LOCK_MS = 2 * 60 * 1000
// 8 attempts with 1, 2, 4, 8, 15, 15, 15 minutes between them: about one hour
export const BRIDGE_DELIVERY_MAX_ATTEMPTS = 8
export const BRIDGE_RETRY_BASE_DELAY_MS = 60 * 1000
export const BRIDGE_RETRY_MAX_DELAY_MS = 15 * 60 * 1000

// Error code set by the DNS lookup when the destination resolves to a blocked IP
export const BRIDGE_BLOCKED_DESTINATION_CODE = 'EBLOCKEDDESTINATION'

// Short, sanitized reasons stored in BridgeDeliveries.lastError
export enum BridgeDeliveryError {
  DISABLED = 'bridge_disabled',
  BLOCKED_DESTINATION = 'blocked_destination',
  TIMEOUT = 'timeout',
  NETWORK = 'network_error',
  MAX_ATTEMPTS = 'max_attempts',
}
