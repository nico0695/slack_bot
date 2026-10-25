import https from 'https'
import axios, { AxiosInstance } from 'axios'
import { singleton } from 'tsyringe'

import {
  BRIDGE_WEBHOOK_MAX_RESPONSE_BYTES,
  BRIDGE_WEBHOOK_SECRET_HEADER,
  BRIDGE_WEBHOOK_TIMEOUT_MS,
} from '../../shared/constants/bridge.constants'
import {
  IBridgeAlertEventPayload,
  IBridgeWebhookResult,
} from '../../shared/interfaces/bridge.interfaces'
import { bridgeSafeLookup, buildBridgeWebhookUrl } from '../../shared/utils/bridgeUrl.utils'

@singleton()
export default class BridgeWebhookRepository {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      timeout: BRIDGE_WEBHOOK_TIMEOUT_MS,
      maxRedirects: 0,
      maxContentLength: BRIDGE_WEBHOOK_MAX_RESPONSE_BYTES,
      // Every status is a result to classify, not an exception
      validateStatus: () => true,
      // A proxy would resolve the host itself, skipping the safe lookup
      proxy: false,
      httpsAgent: new https.Agent({ lookup: bridgeSafeLookup as any }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * POST an alert event to the bridge. Never throws and never exposes request details:
   * returns the HTTP status or a short error code.
   */
  async postAlertEvent(
    baseUrl: string,
    secret: string,
    payload: IBridgeAlertEventPayload
  ): Promise<IBridgeWebhookResult> {
    try {
      const response = await this.client.post(buildBridgeWebhookUrl(baseUrl), payload, {
        headers: { [BRIDGE_WEBHOOK_SECRET_HEADER]: secret },
      })

      return {
        status: response.status,
        retryAfter: response.headers['retry-after'],
      }
    } catch (error) {
      return { errorCode: error?.code ?? 'UNKNOWN' }
    }
  }
}
