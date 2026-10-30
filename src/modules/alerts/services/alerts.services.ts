import { singleton } from 'tsyringe'

import { Alerts } from '../../../entities/alerts'
import { GenericResponse } from '../../../shared/interfaces/services'
import {
  IAlertToNotify,
  IAlert,
  ICreateAlertResponse,
  INotifiedAlert,
  TSnoozeAlertResult,
} from '../shared/interfaces/alerts.interfaces'
import { resolveSnoozeTarget } from '../shared/constants/snoozeCatalog'

import AlertsDataSource from '../repositories/database/alerts.dataSource'
import { UsersRedis } from '../../users/repositories/redis/users.redis'

import { formatTextToDate } from '../../../shared/utils/dates.utils'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('alerts.service')

@singleton()
export default class AlertsServices {
  constructor(private alertsDataSource: AlertsDataSource, private usersRedis: UsersRedis) {}

  /**
   * Create alert with user assistant data
   * @param userId
   * @param dateText
   * @param message
   * @returns
   */
  public async createAssistantAlert(
    userId: number,
    dateText: string,
    message: string,
    channelId?: string
  ): Promise<GenericResponse<Alerts>> {
    try {
      const date = formatTextToDate(dateText)

      const response = await this.alertsDataSource.createAlert({
        userId,
        date,
        message,
        channelId,
      })

      log.info({ userId, alertId: response.id }, 'Alert created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'createAssistantAlert failed')
      return {
        error: 'Error al crear la alerta',
      }
    }
  }

  /**
   * Whether an existing alert matches the data of a repeated request
   */
  private isSameAlertRequest(alert: Alerts, data: IAlert): boolean {
    return (
      alert.message.trim() === data.message.trim() &&
      new Date(alert.date).getTime() === new Date(data.date).getTime() &&
      (alert.source ?? null) === (data.source ?? null) &&
      (alert.deviceId ?? null) === (data.deviceId ?? null)
    )
  }

  private resolveExistingAlert(alert: Alerts, data: IAlert): ICreateAlertResponse {
    if (this.isSameAlertRequest(alert, data)) {
      log.info(
        { userId: data.userId, alertId: alert.id, requestId: data.requestId },
        'Alert request replayed'
      )
      return { data: alert }
    }

    log.warn(
      { userId: data.userId, alertId: alert.id, requestId: data.requestId },
      'Alert requestId reused with different data'
    )
    return {
      error: 'El requestId ya fue usado con datos distintos',
      conflictAlertId: alert.id,
    }
  }

  /**
   * Create an alert once per (user, requestId). Retries return the stored alert,
   * also when a concurrent request inserted it first.
   */
  private async createIdempotentAlert(data: IAlert): Promise<ICreateAlertResponse> {
    const existing = await this.alertsDataSource.getAlertByRequestId(data.userId, data.requestId)

    if (existing) {
      return this.resolveExistingAlert(existing, data)
    }

    await this.alertsDataSource.insertAlertIfAbsent(data)

    // Read back the stored row: ours, or the one of a concurrent request
    const stored = await this.alertsDataSource.getAlertByRequestId(data.userId, data.requestId)

    if (!stored) {
      throw new Error('Alert not found after insert')
    }

    if (!this.isSameAlertRequest(stored, data)) {
      return this.resolveExistingAlert(stored, data)
    }

    log.info(
      { userId: data.userId, alertId: stored.id, requestId: data.requestId },
      'Alert created'
    )

    return { data: stored }
  }

  /**
   * Save alert in database. With a requestId, creation is idempotent
   * @param data IAlert - Data alert
   * @returns
   */
  public async createAlert(data: IAlert): Promise<ICreateAlertResponse> {
    try {
      if (data.requestId) {
        return await this.createIdempotentAlert(data)
      }

      const response = await this.alertsDataSource.createAlert(data)

      log.info({ userId: data.userId, alertId: response.id }, 'Alert created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'createAlert failed')
      return {
        error: 'Error al crear la alerta',
      }
    }
  }

  /**
   * Get alerts by user id
   * @param userId number - User id
   * @returns
   */
  public async getAlertsByUserId(
    userId: number,
    options: Partial<IAlert> = { sent: false }
  ): Promise<GenericResponse<Alerts[]>> {
    try {
      const response = await this.alertsDataSource.getAlertsByUserId(userId, options)

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'getAlertsByUserId failed')
      return {
        error: 'Error al obtener las alertas',
      }
    }
  }

  public async getAlertById(alertId: number, userId: number): Promise<GenericResponse<Alerts>> {
    try {
      const response = await this.alertsDataSource.getAlertById(alertId, userId)

      if (!response) {
        return {
          error: 'No se encontró la alerta solicitada',
        }
      }

      return { data: response }
    } catch (error) {
      log.error({ err: error, alertId, userId }, 'getAlertById failed')
      return {
        error: 'Error al obtener la alerta solicitada',
      }
    }
  }

  public async rescheduleAlert(
    alertId: number,
    userId: number,
    minutesToAdd: number
  ): Promise<GenericResponse<Alerts>> {
    try {
      const alertResponse = await this.alertsDataSource.getAlertById(alertId, userId)

      if (!alertResponse) {
        return {
          error: 'No se encontró la alerta solicitada',
        }
      }

      const now = new Date()
      const alertDate = new Date(alertResponse.date)
      const baseDate = alertDate > now ? alertDate : now
      const newDate = new Date(baseDate.getTime() + minutesToAdd * 60 * 1000)

      const updated = await this.alertsDataSource.updateAlert(alertId, userId, {
        date: newDate,
        sent: false,
      })

      return {
        data: updated,
      }
    } catch (error) {
      log.error({ err: error, alertId, userId }, 'rescheduleAlert failed')
      return {
        error: 'Error al reagendar la alerta',
      }
    }
  }

  /**
   * Snooze an alert by preset only while its date is still `expectedScheduledAt`.
   * Rejections are results; database failures throw, so callers can tell a
   * rejection from an unconfirmed outcome
   * @param presetKey string - A snooze catalog key
   * @param expectedScheduledAt Date - Alert date the caller saw
   */
  public async snoozeAlertByPreset(
    alertId: number,
    userId: number,
    presetKey: string,
    expectedScheduledAt: Date
  ): Promise<TSnoozeAlertResult> {
    const target = resolveSnoozeTarget(presetKey, expectedScheduledAt, new Date())

    if (!target) {
      throw new Error(`Unknown snooze preset: ${presetKey}`)
    }

    const updated = await this.alertsDataSource.rescheduleIfScheduledAt(
      alertId,
      userId,
      expectedScheduledAt,
      target
    )

    if (updated) {
      log.info({ alertId, userId, presetKey }, 'Alert snoozed')
      return { status: 'snoozed', alertId, scheduledAt: target }
    }

    const current = await this.alertsDataSource.findAlertById(alertId, userId)

    if (!current) {
      return { status: 'not_found' }
    }

    log.info({ alertId, userId, presetKey }, 'Alert snooze rejected, schedule changed')
    return { status: 'schedule_changed' }
  }

  public async markAlertResolved(
    alertId: number,
    userId: number
  ): Promise<GenericResponse<Alerts>> {
    try {
      const updated = await this.alertsDataSource.updateAlert(alertId, userId, {
        sent: true,
      })

      if (!updated) {
        return {
          error: 'No se encontró la alerta solicitada',
        }
      }

      return { data: updated }
    } catch (error) {
      log.error({ err: error, alertId, userId }, 'markAlertResolved failed')
      return {
        error: 'Error al marcar la alerta como resuelta',
      }
    }
  }

  public async createFollowUpAlert(
    alertId: number,
    userId: number,
    minutesToAdd: number
  ): Promise<GenericResponse<Alerts>> {
    try {
      const alert = await this.alertsDataSource.getAlertById(alertId, userId)

      if (!alert) {
        return {
          error: 'No se encontró la alerta base para duplicar',
        }
      }

      const currentDate = new Date(alert.date)
      const newDate = new Date(currentDate.getTime() + minutesToAdd * 60 * 1000)

      const created = await this.alertsDataSource.createAlert({
        userId,
        message: alert.message,
        date: newDate,
      })

      return {
        data: created,
      }
    } catch (error) {
      log.error({ err: error, alertId, userId }, 'createFollowUpAlert failed')
      return {
        error: 'Error al crear la alerta recurrente',
      }
    }
  }

  public async getAlertsToNotify(): Promise<GenericResponse<IAlertToNotify[]>> {
    try {
      const date = new Date()

      let response = await this.alertsDataSource.getAlertsByDate(date)

      const usersSubscriptions = await this.usersRedis.getUsersSubscriptions()

      if (usersSubscriptions) {
        response = response.map((alert) => ({
          ...alert,
          user: {
            ...alert.user,
            pwSubscription: usersSubscriptions[alert.user.id.toString()],
          },
        }))
      }

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error }, 'getAlertsToNotify failed')
      return {
        error: 'Error al obtener las alertas',
      }
    }
  }

  public async updateAlertAsNotified(alerts: INotifiedAlert[]): Promise<GenericResponse<boolean>> {
    try {
      await this.alertsDataSource.updateAlertAsNotified(alerts)

      return {
        data: true,
      }
    } catch (error) {
      log.error(
        { err: error, alertIds: alerts.map((alert) => alert.id) },
        'updateAlertAsNotified failed'
      )
      return {
        error: 'Error al actualizar la alerta',
      }
    }
  }

  public async deleteAlert(alertId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const res = await this.alertsDataSource.deleteAlerts(alertId, userId)

      log.info({ alertId, userId }, 'Alert deleted')

      return {
        data: res > 0,
      }
    } catch (error) {
      log.error({ err: error, alertId, userId }, 'deleteAlert failed')
      return {
        error: 'Error al eliminar la alerta',
      }
    }
  }
}
