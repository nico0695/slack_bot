import { Router } from 'express'
import { injectable } from 'tsyringe'

import ConstantsServices from '../services/constants.services'

@injectable()
export default class ConstantsController {
  public router: Router

  constructor(private constantsServices: ConstantsServices) {
    this.getAllConstants = this.getAllConstants.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getAllConstants)
    this.router.get('/:key', this.getConstantByKey)
    this.router.put('/:key', this.updateConstantByKey)
    this.router.post('/', this.createConstant)
  }

  public async getAllConstants(req: any, res: any): Promise<void> {
    try {
      const constants = await this.constantsServices.getAllConstants()

      res.status(200).json(constants)
      return
    } catch (error) {
      res.status(500).json(error)
    }
  }

  public async getConstantByKey(req: any, res: any): Promise<void> {
    try {
      const { key } = req.params

      const constant = await this.constantsServices.getConstantByKey(key)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }

  public async updateConstantByKey(req: any, res: any): Promise<void> {
    try {
      const { key } = req.params
      const { value } = req.body

      const constant = await this.constantsServices.updateConstantByKey(key, value)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }

  public async createConstant(req: any, res: any): Promise<void> {
    try {
      const { key, value } = req.body

      const constant = await this.constantsServices.createConstant(key, value)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }
}
