import { Alerts } from '../../../entities/alerts'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IAlertToNotify, IAlerts } from '../shared/interfaces/alerts.interfaces'

import AlertsDataSource from '../repositories/database/alerts.dataSource'
import { UsersRedis } from '../../users/repositories/redis/users.redis'

import { formatTextToDate } from '../../../shared/utils/dates.utils'

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
    message: string
  ): Promise<GenericResponse<Alerts>> {
    try {
      const date = formatTextToDate(dateText)

      const response = await this.#alertsDataSource.createAlert({
        userId,
        date,
        message,
      })

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear la alerta',
      }
    }
  }

  /**
   * Save alert in database
   * @param data IAlerts - Data alert
   * @returns
   */
  public async createAlert(data: IAlerts): Promise<GenericResponse<Alerts>> {
    try {
      const response = await this.#alertsDataSource.createAlert(data)

      return {
        data: response,
      }
    } catch (error) {
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
  public async getAlertsByUserId(userId: number): Promise<GenericResponse<Alerts[]>> {
    try {
      const response = await this.#alertsDataSource.getAlertsByUserId(userId)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al obtener las alertas',
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
      return {
        error: 'Error al actualizar la alerta',
      }
    }
  }
}
