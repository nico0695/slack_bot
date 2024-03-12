import { In, LessThan } from 'typeorm'

import { Alerts } from '../../../../entities/alerts'
import { Users } from '../../../../entities/users'

import { IAlertToNotify, IAlert } from '../../shared/interfaces/alerts.interfaces'

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
   * @param data IAlert - Data alert
   * @returns
   */
  async createAlert(data: IAlert): Promise<Alerts> {
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
  async getAlertsByUserId(userId: number, options: Partial<IAlert> = {}): Promise<Alerts[]> {
    try {
      const alerts = await Alerts.find({
        where: { user: { id: userId }, ...options },
      })

      return alerts
    } catch (error) {
      return error
    }
  }

  async getAlertsByDate(date: Date): Promise<IAlertToNotify[]> {
    try {
      const alerts = await Alerts.find({
        select: {
          id: true,
          message: true,
          date: true,
          user: {
            id: true,
            username: true,
            email: true,
            slackId: true,
            slackChannelId: true,
          },
        },
        relations: ['user'],
        where: { date: LessThan(date), sent: false },
      })

      return alerts as unknown as IAlertToNotify[]
    } catch (error) {
      return error
    }
  }

  async updateAlertAsNotified(alerts: number[]): Promise<void> {
    try {
      await Alerts.update({ id: In(alerts) }, { sent: true })
    } catch (error) {
      return error
    }
  }

  async deleteAlerts(alertId: number, userId: number): Promise<void> {
    try {
      await Alerts.delete({ id: alertId, user: { id: userId } })
    } catch (error) {
      return error
    }
  }
}
