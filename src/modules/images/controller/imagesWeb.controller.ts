import { Router } from 'express'

import ImagesServices from '../services/images.services'

export default class ImagesWebController {
  public router: Router

  #imagesServices: ImagesServices

  constructor() {
    this.#imagesServices = new ImagesServices()

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/get-images', this.getImages)
  }

  // ROUTES

  public getImages = async (req: any, res: any): Promise<void> => {
    const {
      query: { page = 1, pageSize = 6 },
    } = req

    try {
      const pageInt = parseInt(page, 10)
      const sizeInt = parseInt(pageSize, 10)

      const response = await this.#imagesServices.getImages(pageInt, sizeInt)

      if (response.error) res.status(500).send(response)

      res.status(200).send(response.data)
    } catch (error) {
      console.log('error= ', error.message)
      res.status(500).send({ error: error.message })
    }
  }
}
