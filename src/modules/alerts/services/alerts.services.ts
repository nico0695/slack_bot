import { Alerts } from '../../../entities/alerts'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IAlertToNotify, IAlert } from '../shared/interfaces/alerts.interfaces'

import AlertsDataSource from '../repositories/database/alerts.dataSource'
import { UsersRedis } from '../../users/repositories/redis/users.redis'

import { formatTextToDate } from '../../../shared/utils/dates.utils'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('alerts.service')

export default class AlertsServices {
  static #instance: AlertsServices

  #alertsDataSource: AlertsDataSource
  #usersRedis: UsersRedis

  private constructor() {
    this.#alertsDataSource = AlertsDataSource.getInstance()
    this.#usersRedis = UsersRedis.getInstance()
  }

  static getInstance(): AlertsServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new AlertsServices()
    return this.#instance
  }

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

      const response = await this.#alertsDataSource.createAlert({
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
   * Save alert in database
   * @param data IAlert - Data alert
   * @returns
   */
  public async createAlert(data: IAlert): Promise<GenericResponse<Alerts>> {
    try {
      const response = await this.#alertsDataSource.createAlert(data)

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
      const response = await this.#alertsDataSource.getAlertsByUserId(userId, options)

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
      const response = await this.#alertsDataSource.getAlertById(alertId, userId)

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
      const alertResponse = await this.#alertsDataSource.getAlertById(alertId, userId)

      if (!alertResponse) {
        return {
          error: 'No se encontró la alerta solicitada',
        }
      }

      const now = new Date()
      const alertDate = new Date(alertResponse.date)
      const baseDate = alertDate > now ? alertDate : now
      const newDate = new Date(baseDate.getTime() + minutesToAdd * 60 * 1000)

      const updated = await this.#alertsDataSource.updateAlert(alertId, userId, {
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

  public async markAlertResolved(
    alertId: number,
    userId: number
  ): Promise<GenericResponse<Alerts>> {
    try {
      const updated = await this.#alertsDataSource.updateAlert(alertId, userId, {
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
      const alert = await this.#alertsDataSource.getAlertById(alertId, userId)

      if (!alert) {
        return {
          error: 'No se encontró la alerta base para duplicar',
        }
      }

      const currentDate = new Date(alert.date)
      const newDate = new Date(currentDate.getTime() + minutesToAdd * 60 * 1000)

      const created = await this.#alertsDataSource.createAlert({
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

      let response = await this.#alertsDataSource.getAlertsByDate(date)

      const usersSubscriptions = await this.#usersRedis.getUsersSubscriptions()

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

  public async updateAlertAsNotified(alertId: number[]): Promise<GenericResponse<boolean>> {
    try {
      await this.#alertsDataSource.updateAlertAsNotified(alertId)

      return {
        data: true,
      }
    } catch (error) {
      log.error({ err: error, alertId }, 'updateAlertAsNotified failed')
      return {
        error: 'Error al actualizar la alerta',
      }
    }
  }

  public async deleteAlert(alertId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const res = await this.#alertsDataSource.deleteAlerts(alertId, userId)

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
