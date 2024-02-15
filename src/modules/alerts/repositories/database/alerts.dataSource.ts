import { Alerts } from '../../../../entities/alerts'
import { Users } from '../../../../entities/users'

import { IAlerts } from '../../shared/interfaces/alerts.interfaces'

export default class AlertsDataSource {
  static #instance: AlertsDataSource

  private constructor() {}

  static getInstance(): AlertsDataSource {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new AlertsDataSource()
    return this.#instance
  }

  /**
   * Save alert in database
   * @param data IAlerts - Data alert
   * @returns
   */
  async createAlert(data: IAlerts): Promise<Alerts> {
    try {
      const user = new Users()
      user.id = data.userId

      const newAlert = new Alerts()

      newAlert.message = data.message
      newAlert.date = data.date
      newAlert.user = user

      await newAlert.save()

      return newAlert
    } catch (error) {
      return error
    }
  }

  /**
   * Get alerts by user id
   * @param userId number - User id
   * @returns
   */
  async getAlertsByUserId(userId: number): Promise<Alerts[]> {
    try {
      const alerts = await Alerts.find({ where: { user: { id: userId } } })

      return alerts
    } catch (error) {
      return error
    }
  }
}
