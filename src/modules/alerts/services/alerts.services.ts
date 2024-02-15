import { Alerts } from '../../../entities/alerts'
import { GenericResponse } from '../../../shared/interfaces/services'
import { IAlerts } from '../shared/interfaces/alerts.interfaces'
import AlertsDataSource from '../repositories/database/alerts.dataSource'
import { formatTextToDate } from '../../../shared/utils/dates.utils'

export default class AlertsServices {
  static #instance: AlertsServices

  #alertsDataSource: AlertsDataSource

  private constructor() {
    this.#alertsDataSource = AlertsDataSource.getInstance()
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
}
