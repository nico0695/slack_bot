/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateParams, idParamSchema } from '../../../shared/utils/validation'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import AlertsServices from '../services/alerts.services'
import { IAlert } from '../shared/interfaces/alerts.interfaces'
import { createAlertSchema } from '../shared/schemas/alerts.schemas'

export default class AlertsWebController extends GenericController {
  private static instance: AlertsWebController

  public router: Router

  private alertsServices: AlertsServices

  private constructor() {
    super()
    this.createAlert = this.createAlert.bind(this)
    this.getAlerts = this.getAlerts.bind(this)
    this.deleteAlert = this.deleteAlert.bind(this)

    this.alertsServices = AlertsServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): AlertsWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new AlertsWebController()
    return this.instance
  }

  /** Alerts Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getAlerts)
    this.router.post('/', this.createAlert)
    this.router.delete('/:id', this.deleteAlert)
  }

  /** Alerts Controllers Methods */

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

    const response = await this.alertsServices.createAlert(dataAlert)

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
}
