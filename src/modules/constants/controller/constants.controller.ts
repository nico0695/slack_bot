import { Router } from 'express'
import ConstantsServices from '../services/constants.services'

export default class ConstantsController {
  public router: Router

  #constantsServices: ConstantsServices

  constructor() {
    this.getAllConstants = this.getAllConstants.bind(this)

    this.#constantsServices = new ConstantsServices()

    this.router = Router()
    this.registerRoutes()
  }

  /** Constants Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getAllConstants)
    this.router.get('/:key', this.getConstantByKey)
    this.router.put('/:key', this.updateConstantByKey)
    this.router.post('/', this.createConstant)
  }

  /** Constants Controllers Methods */

  /**
   * Get all constants
   * @param req Request
   * @param res Response
   * @returns
   */
  public async getAllConstants(req: any, res: any): Promise<void> {
    try {
      const constants = await this.#constantsServices.getAllConstants()

      res.status(200).json(constants)
      return
    } catch (error) {
      res.status(500).json(error)
    }
  }

  /**
   * Get constant by key
   * @param req Request
   * @param res Response
   * @returns
   */
  public async getConstantByKey(req: any, res: any): Promise<void> {
    try {
      const { key } = req.params

      const constant = await this.#constantsServices.getConstantByKey(key)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }

  /**
   * Update constant by key, if constant not exists, create new constant
   * @param req Request
   * @param res Response
   * @returns
   */
  public async updateConstantByKey(req: any, res: any): Promise<void> {
    try {
      const { key } = req.params
      const { value } = req.body

      const constant = await this.#constantsServices.updateConstantByKey(key, value)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }

  /**
   * Create new constant
   * @param req Request
   * @param res Response
   * @returns
   */
  public async createConstant(req: any, res: any): Promise<void> {
    try {
      const { key, value } = req.body

      const constant = await this.#constantsServices.createConstant(key, value)

      res.status(200).json(constant)
    } catch (error) {
      res.status(500).json(error)
    }
  }
}
