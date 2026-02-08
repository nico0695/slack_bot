import { Router } from 'express'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'

import SummaryServices from '../services/summary.services'

export default class SummaryWebController {
  private static instance: SummaryWebController

  public router: Router

  private summaryServices: SummaryServices

  private constructor() {
    this.summaryServices = SummaryServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): SummaryWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new SummaryWebController()
    return this.instance
  }

  // ROUTES

  protected registerRoutes(): void {
    this.router.post('/', this.generateSumaryText)
  }

  public generateSumaryText = async (req: any, res: any): Promise<void> => {
    const { body } = req
    const { text } = body

    if (!text) {
      throw new BadRequestError({ message: 'Text is required' })
    }
    const response = await this.summaryServices.generateSumary(text)

    if (response.error) {
      throw new BadRequestError({ message: 'Error al generar el resumen' })
    }

    res.status(200).send(response.data)
  }
}
