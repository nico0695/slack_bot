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
