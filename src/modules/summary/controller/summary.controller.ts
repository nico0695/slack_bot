import { Router } from 'express'

import SummaryServices from '../services/summary.services'

export default class SummaryWebController {
  static #instance: SummaryWebController

  public router: Router

  #summaryServices: SummaryServices

  private constructor() {
    this.#summaryServices = SummaryServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): SummaryWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new SummaryWebController()
    return this.#instance
  }

  // ROUTES

  protected registerRoutes(): void {
    this.router.post('/', this.generateSumaryText)
  }

  public generateSumaryText = async (req: any, res: any): Promise<void> => {
    const { body } = req
    const { text } = body

    try {
      if (!text) {
        res.status(400).send({ error: 'Text is required' })
      }
      const response = await this.#summaryServices.generateSumary(text)

      if (response.error) res.status(500).send(response)

      res.status(200).send(response.data)
    } catch (error) {
      console.log('error= ', error.message)
      res.status(500).send({ error: error.message })
    }
  }
}
