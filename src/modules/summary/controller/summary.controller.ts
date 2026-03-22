import { Router } from 'express'
import { injectable } from 'tsyringe'

import BadRequestError from '../../../shared/utils/errors/BadRequestError'

import SummaryServices from '../services/summary.services'

@injectable()
export default class SummaryWebController {
  public router: Router

  constructor(private summaryServices: SummaryServices) {
    this.router = Router()
    this.registerRoutes()
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
