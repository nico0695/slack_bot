/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import { injectable } from 'tsyringe'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import ConflictError from '../../../shared/utils/errors/ConflictError'
import NotFoundError from '../../../shared/utils/errors/NotFoundError'
import { validateBody, validateParams, idParamSchema } from '../../../shared/utils/validation'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import AlertsServices from '../services/alerts.services'
import { IAlert } from '../shared/interfaces/alerts.interfaces'
import {
  createAlertSchema,
  snoozeAlertBodySchema,
  snoozeAlertParamsSchema,
} from '../shared/schemas/alerts.schemas'

@injectable()
export default class AlertsWebController extends GenericController {
  public router: Router

  constructor(private alertsServices: AlertsServices) {
    super()
    this.createAlert = this.createAlert.bind(this)
    this.getAlerts = this.getAlerts.bind(this)
    this.deleteAlert = this.deleteAlert.bind(this)
    this.snoozeAlert = this.snoozeAlert.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getAlerts)
    this.router.post('/', this.createAlert)
    this.router.delete('/:id', this.deleteAlert)
    this.router.post('/:id/snooze', this.snoozeAlert)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async createAlert(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createAlertSchema, req.body)

    const dataAlert: IAlert = {
      message: parsed.message,
      date: parsed.date,
      userId: user.id,
    }

    if (parsed.requestId) {
      dataAlert.requestId = parsed.requestId
      dataAlert.source = parsed.source ?? null
      dataAlert.deviceId = parsed.deviceId ?? null
    }

    const response = await this.alertsServices.createAlert(dataAlert)

    if (response.conflictAlertId) {
      throw new ConflictError({
        message: response.error,
        context: { code: 'ALERT_REQUEST_CONFLICT', alertId: response.conflictAlertId },
      })
    }

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getAlerts(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.alertsServices.getAlertsByUserId(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteAlert(req: any, res: any): Promise<void> {
    const { id: alertId } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.alertsServices.deleteAlert(alertId, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  /**
   * Validate a snooze request. Every invalid part is reported with the
   * INVALID_SNOOZE_REQUEST code the bridge contract defines
   */
  private parseSnoozeRequest(req: any): {
    alertId: number
    preset: string
    expectedScheduledAt: Date
  } {
    const params = snoozeAlertParamsSchema.safeParse(req.params)
    const body = snoozeAlertBodySchema.safeParse(req.body)

    if (!params.success || !body.success) {
      const issues = [
        ...(params.success ? [] : params.error.issues),
        ...(body.success ? [] : body.error.issues),
      ]

      throw new BadRequestError({
        message: 'Invalid snooze request.',
        context: {
          code: 'INVALID_SNOOZE_REQUEST',
          fields: issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
    }

    return {
      alertId: params.data.id,
      preset: body.data.preset,
      expectedScheduledAt: body.data.expected_scheduled_at,
    }
  }

  /**
   * Snooze an alert of the authenticated user by preset, only while its date is
   * still `expected_scheduled_at`. Unexpected failures reach the error handler as 500
   */
  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async snoozeAlert(req: any, res: any): Promise<void> {
    const user = this.userData
    const { alertId, preset, expectedScheduledAt } = this.parseSnoozeRequest(req)

    const result = await this.alertsServices.snoozeAlertByPreset(
      alertId,
      user.id,
      preset,
      expectedScheduledAt
    )

    if (result.status === 'not_found') {
      throw new NotFoundError({
        message: 'The alert was not found.',
        context: { code: 'ALERT_NOT_FOUND' },
      })
    }

    if (result.status === 'schedule_changed') {
      throw new ConflictError({
        message: 'The alert schedule has changed.',
        context: { code: 'ALERT_SCHEDULE_CHANGED' },
      })
    }

    res.send({ alert_id: result.alertId, scheduled_at: result.scheduledAt.toISOString() })
  }
}
