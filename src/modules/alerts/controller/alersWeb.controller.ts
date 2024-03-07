/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import AlertsServices from '../services/alerts.services'
import { IAlert } from '../shared/interfaces/alerts.interfaces'

export default class AlertsWebController extends GenericController {
  static #instance: AlertsWebController

  public router: Router

  #alertsServices: AlertsServices

  private constructor() {
    super()
    this.createAlert = this.createAlert.bind(this)
    this.getAlerts = this.getAlerts.bind(this)
    this.deleteAlert = this.deleteAlert.bind(this)

    this.#alertsServices = AlertsServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): AlertsWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new AlertsWebController()
    return this.#instance
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
    try {
      const user = this.userData

      const dataAlert: IAlert = {
        message: req.body.message,
        date: req.body.date,
        userId: user.id,
      }

      if (!dataAlert.message || !dataAlert.date) {
        res.status(400).send({ message: 'Ingrese los datos correctos' })
        return
      }

      const response = await this.#alertsServices.createAlert(dataAlert)

      if (response.error) {
        res.status(400).send({ message: response.error })
        return
      }

      res.send(response.data)
    } catch (error) {
      res.status(400).send({ message: error.message })
    }
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getAlerts(req: any, res: any): Promise<void> {
    try {
      const user = this.userData

      const response = await this.#alertsServices.getAlertsByUserId(user.id)

      if (response.error) {
        res.status(400).send({ message: response.error })
        return
      }

      res.send(response.data)
    } catch (error) {
      res.status(400).send({ message: error.message })
    }
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteAlert(req: any, res: any): Promise<void> {
    try {
      const user = this.userData

      const response = await this.#alertsServices.deleteAlert(req.params.id, user.id)

      if (response.error) {
        res.status(400).send({ message: response.error })
        return
      }

      res.send(response.data)
    } catch (error) {
      res.status(400).send({ message: error.message })
    }
  }
}
