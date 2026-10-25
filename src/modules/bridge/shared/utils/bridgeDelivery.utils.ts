import {
  BRIDGE_BLOCKED_DESTINATION_CODE,
  BRIDGE_RETRY_BASE_DELAY_MS,
  BRIDGE_RETRY_MAX_DELAY_MS,
  BridgeDeliveryError,
} from '../constants/bridge.constants'
import { IBridgeDeliveryResult, IBridgeWebhookResult } from '../interfaces/bridge.interfaces'

/**
 * Parse a Retry-After header (seconds or HTTP date) into milliseconds
 */
export const parseRetryAfterMs = (value: string | undefined, now: Date): number | undefined => {
  if (!value) return undefined

  if (/^\d+$/.test(value.trim())) {
    return parseInt(value, 10) * 1000
  }

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined

  return Math.max(date - now.getTime(), 0)
}

/**
 * Delay before the next attempt: exponential from 1 minute, capped at 15 minutes.
 * A Retry-After from the bridge replaces it, with the same cap.
 * @param attempts number - Attempts already made, including the failed one
 */
export const getRetryDelayMs = (attempts: number, retryAfterMs?: number): number => {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, BRIDGE_RETRY_MAX_DELAY_MS)
  }

  return Math.min(BRIDGE_RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), BRIDGE_RETRY_MAX_DELAY_MS)
}

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500

/**
 * Decide what to do with a delivery after a webhook attempt
 */
export const classifyWebhookResult = (
  result: IBridgeWebhookResult,
  now: Date
): IBridgeDeliveryResult => {
  if (result.status === undefined) {
    if (result.errorCode === BRIDGE_BLOCKED_DESTINATION_CODE) {
      return {
        outcome: 'failed',
        lastStatusCode: null,
        lastError: BridgeDeliveryError.BLOCKED_DESTINATION,
      }
    }

    const lastError =
      result.errorCode === 'ECONNABORTED' || result.errorCode === 'ETIMEDOUT'
        ? BridgeDeliveryError.TIMEOUT
        : BridgeDeliveryError.NETWORK

    return { outcome: 'retry', lastStatusCode: null, lastError }
  }

  if (result.status >= 200 && result.status < 300) {
    return { outcome: 'delivered', lastStatusCode: result.status, lastError: null }
  }

  if (isRetryableStatus(result.status)) {
    return {
      outcome: 'retry',
      lastStatusCode: result.status,
      lastError: `http_${result.status}`,
      retryAfterMs: parseRetryAfterMs(result.retryAfter, now),
    }
  }

  // Redirects and other 4xx (invalid secret, payload or conflicting event) are final
  return { outcome: 'failed', lastStatusCode: result.status, lastError: `http_${result.status}` }
}
