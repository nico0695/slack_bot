import { FindOptionsWhere, In, IsNull, LessThan } from 'typeorm'
import { singleton } from 'tsyringe'

import { Alerts } from '../../../../entities/alerts'
import { Users } from '../../../../entities/users'

import { IAlertToNotify, IAlert } from '../../shared/interfaces/alerts.interfaces'

@singleton()
export default class AlertsDataSource {
  constructor() {}

  /**
   * Save alert in database. Throws when the insert fails
   * @param data IAlert - Data alert
   * @returns
   */
  async createAlert(data: IAlert): Promise<Alerts> {
    const user = new Users()
    user.id = data.userId

    const newAlert = new Alerts()

    newAlert.message = data.message
    newAlert.date = data.date
    newAlert.user = user
    if (data.channelId) {
      newAlert.channelId = data.channelId
    }

    await newAlert.save()

    return newAlert
  }

  /**
   * Insert an alert with a requestId unless the user already has one with it.
   * A single INSERT OR IGNORE statement outside a transaction: a failed save would
   * roll back the shared SQLite connection, losing a concurrent request's insert.
   * Throws when the insert fails
   * @param data IAlert - Data alert with requestId
   */
  async insertAlertIfAbsent(data: IAlert): Promise<void> {
    await Alerts.createQueryBuilder()
      .insert()
      .into(Alerts)
      .values({
        message: data.message,
        date: data.date,
        user: { id: data.userId },
        channelId: data.channelId ?? null,
        requestId: data.requestId,
        source: data.source ?? null,
        deviceId: data.deviceId ?? null,
      })
      .orIgnore()
      .execute()
  }

  /**
   * Get the alert created by a request id of a user. Throws when the query fails
   * @param userId number - User id
   * @param requestId string - Client request id
   * @returns
   */
  async getAlertByRequestId(userId: number, requestId: string): Promise<Alerts | null> {
    return await Alerts.findOne({
      where: { user: { id: userId }, requestId },
      // The unique index also covers soft deleted rows
      withDeleted: true,
    })
  }

  /**
   * Get alerts by user id
   * @param userId number - User id
   * @returns
   */
  async getAlertsByUserId(userId: number, options: Partial<IAlert> = {}): Promise<Alerts[]> {
    try {
      const where: FindOptionsWhere<Alerts> = {}
      const { channelId, userId: _userId, ...restOptions } = options ?? {}
      const rawChannelId = channelId

      if (typeof rawChannelId === 'string' && rawChannelId.trim().length > 0) {
        where.channelId = rawChannelId.trim()
      } else if (rawChannelId === null) {
        where.channelId = IsNull()
        where.user = { id: userId }
      } else {
        where.user = { id: userId }
      }

      // Filter sent = false by default unless explicitly overridden
      if (!('sent' in restOptions)) {
        where.sent = false
      }

      Object.assign(where, restOptions)

      const alerts = await Alerts.find({
        where,
        order: {
          date: 'ASC',
        },
      })

      return alerts
    } catch (error) {
      return error
    }
  }

  async getAlertById(alertId: number, userId: number): Promise<Alerts | null> {
    try {
      const alert = await Alerts.findOne({
        where: { id: alertId, user: { id: userId } },
      })

      return alert
    } catch (error) {
      return error
    }
  }

  async updateAlert(
    alertId: number,
    userId: number,
    payload: Partial<Pick<Alerts, 'date' | 'sent' | 'message'>>
  ): Promise<Alerts | null> {
    try {
      await Alerts.update({ id: alertId, user: { id: userId } }, payload)

      return await this.getAlertById(alertId, userId)
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
            bridgeBaseUrl: true,
            bridgeWebhookEnabled: true,
          },
          channelId: true,
          requestId: true,
          deviceId: true,
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

  async deleteAlerts(alertId: number, userId: number): Promise<number> {
    try {
      const result = await Alerts.delete({ id: alertId, user: { id: userId } })
      return result.affected ?? 0
    } catch (error) {
      throw new Error(error)
    }
  }
}
