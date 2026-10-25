/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'
import { injectable } from 'tsyringe'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody } from '../../../shared/utils/validation'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import BridgeServices from '../services/bridge.services'
import { updateBridgeConfigSchema } from '../shared/schemas/bridge.schemas'

@injectable()
export default class BridgeWebController extends GenericController {
  public router: Router

  constructor(private bridgeServices: BridgeServices) {
    super()
    this.getConfig = this.getConfig.bind(this)
    this.updateConfig = this.updateConfig.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/config', this.getConfig)
    this.router.patch('/config', this.updateConfig)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getConfig(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.bridgeServices.getConfig(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async updateConfig(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(updateBridgeConfigSchema, req.body)

    const response = await this.bridgeServices.updateConfig(user.id, parsed)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
