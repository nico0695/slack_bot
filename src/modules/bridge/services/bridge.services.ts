import { randomUUID } from 'crypto'
import { singleton } from 'tsyringe'

import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'

import BridgeConfigDataSource from '../repositories/database/bridgeConfig.dataSource'
import BridgeDeliveriesDataSource from '../repositories/database/bridgeDeliveries.dataSource'
import BridgeWebhookRepository from '../repositories/http/bridgeWebhook.repository'
import { BridgeDeliveries } from '../../../entities/bridgeDeliveries'
import {
  BRIDGE_DELIVERY_BATCH_SIZE,
  BRIDGE_DELIVERY_LOCK_MS,
  BRIDGE_DELIVERY_MAX_ATTEMPTS,
  BRIDGE_EVENT_ALERT_TRIGGERED,
  BRIDGE_EVENT_VERSION,
  BridgeDeliveryError,
  BridgeDeliveryStatus,
} from '../shared/constants/bridge.constants'
import {
  IBridgeAlert,
  IBridgeAlertEventPayload,
  IBridgeConfig,
  IBridgeConfigResponse,
  IBridgeConfigUpdate,
  IBridgeDeliveryUpdate,
} from '../shared/interfaces/bridge.interfaces'
import { getBridgeBaseUrlError } from '../shared/utils/bridgeUrl.utils'
import { classifyWebhookResult, getRetryDelayMs } from '../shared/utils/bridgeDelivery.utils'

const log = createModuleLogger('bridge.service')

@singleton()
export default class BridgeServices {
  constructor(
    private bridgeConfigDataSource: BridgeConfigDataSource,
    private bridgeDeliveriesDataSource: BridgeDeliveriesDataSource,
    private bridgeWebhookRepository: BridgeWebhookRepository
  ) {}

  private toConfigResponse(config: IBridgeConfig): IBridgeConfigResponse {
    return {
      baseUrl: config.baseUrl,
      enabled: config.enabled,
      secretConfigured: Boolean(config.secret),
    }
  }

  /**
   * Merge a partial update into the current config.
   * Omitted fields keep their value, null clears them. Setting a URL enables the
   * webhook unless `enabled` is sent, and clearing the URL or secret disables it.
   */
  private mergeConfig(current: IBridgeConfig, data: IBridgeConfigUpdate): IBridgeConfig {
    const baseUrl = data.baseUrl !== undefined ? data.baseUrl : current.baseUrl
    const secret = data.secret !== undefined ? data.secret : current.secret

    let enabled = current.enabled

    if (data.enabled !== undefined) {
      enabled = data.enabled
    } else if (data.baseUrl === null || data.secret === null) {
      enabled = false
    } else if (data.baseUrl) {
      enabled = true
    }

    return { baseUrl, secret, enabled }
  }

  public async getConfig(userId: number): Promise<GenericResponse<IBridgeConfigResponse>> {
    try {
      const config = await this.bridgeConfigDataSource.getBridgeConfig(userId)

      if (!config) {
        return { error: 'Usuario no encontrado' }
      }

      return { data: this.toConfigResponse(config) }
    } catch (error) {
      log.error({ err: error, userId }, 'getConfig failed')
      return { error: 'Error al obtener la configuración del bridge' }
    }
  }

  public async updateConfig(
    userId: number,
    data: IBridgeConfigUpdate
  ): Promise<GenericResponse<IBridgeConfigResponse>> {
    try {
      const current = await this.bridgeConfigDataSource.getBridgeConfig(userId)

      if (!current) {
        return { error: 'Usuario no encontrado' }
      }

      const config = this.mergeConfig(current, data)

      if (config.enabled && (!config.baseUrl || !config.secret)) {
        return { error: 'Para habilitar el webhook se requieren baseUrl y secret' }
      }

      await this.bridgeConfigDataSource.updateBridgeConfig(userId, config)

      log.info({ userId, enabled: config.enabled }, 'Bridge config updated')

      return { data: this.toConfigResponse(config) }
    } catch (error) {
      log.error({ err: error, userId }, 'updateConfig failed')
      return { error: 'Error al actualizar la configuración del bridge' }
    }
  }

  private buildAlertEventPayload(
    alert: IBridgeAlert,
    eventId: string,
    triggeredAt: Date
  ): IBridgeAlertEventPayload {
    const payload: IBridgeAlertEventPayload = {
      version: BRIDGE_EVENT_VERSION,
      event_id: eventId,
      type: BRIDGE_EVENT_ALERT_TRIGGERED,
      alert_id: alert.id,
      scheduled_at: new Date(alert.date).toISOString(),
      triggered_at: triggeredAt.toISOString(),
      message: alert.message,
    }

    if (alert.requestId) payload.request_id = alert.requestId
    if (alert.deviceId) payload.device_id = alert.deviceId

    return payload
  }

  /**
   * Enqueue the webhook event of a triggered alert when its owner has the bridge enabled.
   * Idempotent per alert occurrence, so running it again for the same alert is safe.
   * @returns data true when enqueued, false when the bridge does not apply to the user
   */
  public async enqueueAlertEvent(
    alert: IBridgeAlert,
    triggeredAt: Date
  ): Promise<GenericResponse<boolean>> {
    if (!alert.user.bridgeWebhookEnabled || !alert.user.bridgeBaseUrl) {
      return { data: false }
    }

    try {
      const eventId = randomUUID()

      await this.bridgeDeliveriesDataSource.insertDeliveryIfAbsent({
        eventId,
        alertId: alert.id,
        userId: alert.user.id,
        occurrenceAt: new Date(alert.date),
        payload: this.buildAlertEventPayload(alert, eventId, triggeredAt),
        nextAttemptAt: triggeredAt,
      })

      return { data: true }
    } catch (error) {
      log.error(
        { err: error, alertId: alert.id, userId: alert.user.id },
        'enqueueAlertEvent failed'
      )
      return { error: 'Error al encolar el evento del bridge' }
    }
  }

  /**
   * Send one claimed delivery and compute its next state
   */
  private async sendDelivery(
    delivery: BridgeDeliveries,
    now: Date
  ): Promise<IBridgeDeliveryUpdate> {
    const config = await this.bridgeConfigDataSource.getBridgeConfig(delivery.userId)

    // Disabling the bridge discards its pending events
    if (!config?.enabled || !config.baseUrl || !config.secret) {
      return {
        status: BridgeDeliveryStatus.FAILED,
        lockedUntil: null,
        lastError: BridgeDeliveryError.DISABLED,
      }
    }

    if (getBridgeBaseUrlError(config.baseUrl)) {
      return {
        status: BridgeDeliveryStatus.FAILED,
        lockedUntil: null,
        lastError: BridgeDeliveryError.BLOCKED_DESTINATION,
      }
    }

    const attempts = delivery.attempts + 1
    const response = await this.bridgeWebhookRepository.postAlertEvent(
      config.baseUrl,
      config.secret,
      delivery.payload
    )
    const result = classifyWebhookResult(response, now)

    const update: IBridgeDeliveryUpdate = {
      status: BridgeDeliveryStatus.FAILED,
      attempts,
      lockedUntil: null,
      lastStatusCode: result.lastStatusCode,
      lastError: result.lastError,
    }

    if (result.outcome === 'delivered') {
      return { ...update, status: BridgeDeliveryStatus.DELIVERED, deliveredAt: now }
    }

    if (result.outcome === 'retry') {
      if (attempts >= BRIDGE_DELIVERY_MAX_ATTEMPTS) {
        return { ...update, lastError: BridgeDeliveryError.MAX_ATTEMPTS }
      }

      return {
        ...update,
        status: BridgeDeliveryStatus.PENDING,
        nextAttemptAt: new Date(now.getTime() + getRetryDelayMs(attempts, result.retryAfterMs)),
      }
    }

    return update
  }

  private async processDelivery(delivery: BridgeDeliveries, now: Date): Promise<string | null> {
    const lockedUntil = new Date(now.getTime() + BRIDGE_DELIVERY_LOCK_MS)
    const claimed = await this.bridgeDeliveriesDataSource.claimDelivery(delivery, now, lockedUntil)

    if (!claimed) return null

    const update = await this.sendDelivery(delivery, now)
    await this.bridgeDeliveriesDataSource.updateDelivery(delivery.id, update)

    const logData = {
      deliveryId: delivery.id,
      eventId: delivery.eventId,
      alertId: delivery.alertId,
      userId: delivery.userId,
      attempts: update.attempts ?? delivery.attempts,
      status: update.status,
      lastStatusCode: update.lastStatusCode,
      lastError: update.lastError,
    }

    if (update.status === BridgeDeliveryStatus.DELIVERED) {
      log.info(logData, 'Bridge event delivered')
    } else {
      log.warn(logData, 'Bridge event not delivered')
    }

    return update.status
  }

  /**
   * Send due bridge events. Each event is claimed first, so overlapping or restarted
   * runs never send the same attempt twice; a crash mid attempt is retried after the lock.
   * @returns number of events processed per resulting status
   */
  public async processPendingDeliveries(
    now: Date
  ): Promise<GenericResponse<Record<string, number>>> {
    try {
      const deliveries = await this.bridgeDeliveriesDataSource.getDueDeliveries(
        now,
        BRIDGE_DELIVERY_BATCH_SIZE
      )

      const statuses = await Promise.all(
        deliveries.map(async (delivery) => {
          try {
            return await this.processDelivery(delivery, now)
          } catch (error) {
            // Left as sending: picked up again when its lock expires
            log.error({ err: error, deliveryId: delivery.id }, 'processDelivery failed')
            return null
          }
        })
      )

      const summary: Record<string, number> = {}
      statuses
        .filter((status) => status !== null)
        .forEach((status) => {
          summary[status] = (summary[status] ?? 0) + 1
        })

      return { data: summary }
    } catch (error) {
      log.error({ err: error }, 'processPendingDeliveries failed')
      return { error: 'Error al procesar los eventos del bridge' }
    }
  }
}
